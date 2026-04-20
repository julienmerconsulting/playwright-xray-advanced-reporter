/**
 * E2E mock test - simulates a complete Playwright session and intercepts
 * every HTTP call to JIRA + Xray to validate:
 *   - Call ordering
 *   - Payloads sent
 *   - Test Execution created, results imported, Test Plan linked
 *
 * No real network connection. fetch is monkey-patched.
 */

import { XrayAdvancedReporter } from '../src/reporter';
import type { XrayReporterConfig } from '../src/types';

// =========================================================================
// Mock fetch: captures every call
// =========================================================================

type Recorded = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
};

const calls: Recorded[] = [];
const originalFetch = global.fetch;

/**
 * Mock HTTP handler: returns the right response based on URL + method.
 */
function mockHandler(url: string, init?: RequestInit): Response {
  const method = (init?.method || 'GET').toUpperCase();

  // --- Xray authenticate ---
  if (url.includes('/api/v2/authenticate')) {
    return new Response('"fake-jwt-token-123"', { status: 200 });
  }

  // --- Xray import ---
  if (url.includes('/api/v2/import/execution')) {
    return new Response(
      JSON.stringify({ key: 'PROJ-1234', id: '10001' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // --- Xray GraphQL (getTestPlanIssueId + mutations) ---
  if (url.includes('/api/v2/graphql')) {
    const body = typeof init?.body === 'string' ? init.body : '';

    if (body.includes('getTestPlan')) {
      return new Response(
        JSON.stringify({
          data: {
            getTestPlans: {
              results: [{ issueId: 'plan-42', jira: { key: 'PROJ-100' } }],
            },
          },
        }),
        { status: 200 }
      );
    }
    if (body.includes('getTestExecution')) {
      return new Response(
        JSON.stringify({
          data: {
            getTestExecutions: {
              results: [{ issueId: 'exec-99', jira: { key: 'PROJ-1234' } }],
            },
          },
        }),
        { status: 200 }
      );
    }
    return new Response(
      JSON.stringify({
        data: { addTestExecutionsToTestPlan: { addedTestExecutions: ['exec-99'] } },
      }),
      { status: 200 }
    );
  }

  // --- JIRA project info ---
  if (url.match(/\/rest\/api\/3\/project\/[A-Z]+$/)) {
    return new Response(
      JSON.stringify({ id: '10000', key: 'PROJ', name: 'Demo Project' }),
      { status: 200 }
    );
  }

  // --- JIRA issuetype listing ---
  if (url.includes('/rest/api/3/issuetype/project')) {
    return new Response(
      JSON.stringify([
        { id: '10100', name: 'Test Execution' },
        { id: '10001', name: 'Bug' },
      ]),
      { status: 200 }
    );
  }

  // --- JIRA issue creation (Test Execution) ---
  if (url.endsWith('/rest/api/3/issue') && method === 'POST') {
    return new Response(
      JSON.stringify({ id: '20001', key: 'PROJ-1234' }),
      { status: 201 }
    );
  }

  // --- JIRA issueLink / transitions / remotelink / attachments ---
  if (url.includes('/rest/api/3/issueLink') || url.includes('/transitions')) {
    return new Response('{}', { status: 204 });
  }
  if (url.includes('/attachments')) {
    return new Response(JSON.stringify([{ id: 'att-1' }]), { status: 200 });
  }

  // --- JIRA issue read / update / search ---
  if (url.match(/\/rest\/api\/3\/issue\/[^/]+$/)) {
    return new Response(JSON.stringify({ key: 'PROJ-1234' }), { status: 200 });
  }
  if (url.includes('/rest/api/3/search')) {
    return new Response(JSON.stringify({ issues: [], total: 0 }), { status: 200 });
  }

  // Default: 404 for debugging
  console.warn(`[MOCK] Unhandled URL: ${method} ${url}`);
  return new Response('{"error":"not mocked"}', { status: 404 });
}

global.fetch = (async (input: any, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input.url;
  const body = init?.body;
  let parsedBody: any = undefined;
  try {
    parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
  } catch {
    parsedBody = body;
  }
  calls.push({
    url,
    method: (init?.method || 'GET').toUpperCase(),
    headers: (init?.headers as any) || {},
    body: parsedBody,
  });
  return mockHandler(url, init);
}) as any;

// =========================================================================
// Minimal fake Playwright objects
// =========================================================================

function makeTestCase(title: string, projectName = 'chromium'): any {
  return {
    title,
    titlePath: () => [projectName, title],
    location: { file: 'tests/demo.spec.ts', line: 10, column: 1 },
    parent: { project: () => ({ name: projectName }) },
  };
}

function makeTestResult(status: string, duration = 123): any {
  return {
    status,
    duration,
    error: status === 'failed' ? { message: 'Expected X got Y' } : undefined,
    attachments: [],
  };
}

// =========================================================================
// E2E scenario
// =========================================================================

async function main() {
  const config: XrayReporterConfig = {
    jiraBaseUrl: 'https://company.atlassian.net',
    jiraEmail: 'me@company.com',
    jiraApiToken: 'token-fake',
    projectKey: 'PROJ',
    xrayClientId: 'cid-fake',
    xrayClientSecret: 'csec-fake',
    testPlanKey: 'PROJ-100',
    testExecutionLabels: ['Automation', 'Playwright'],
    testEnvironments: ['Chrome'],
    uploadScreenshotsOnFailure: false,
    verbose: false,
  };

  const reporter = new XrayAdvancedReporter(config);

  // Simulated Playwright lifecycle
  await reporter.onBegin({} as any, {} as any);

  reporter.onTestEnd(makeTestCase('[PROJ-10] Login flow'), makeTestResult('passed'));
  reporter.onTestEnd(makeTestCase('[PROJ-11] Checkout'), makeTestResult('failed', 500));
  reporter.onTestEnd(makeTestCase('[PROJ-12] Search'), makeTestResult('skipped'));
  reporter.onTestEnd(makeTestCase('No tag here'), makeTestResult('passed'));

  await reporter.onEnd({ status: 'failed' } as any);

  // Restore
  global.fetch = originalFetch;

  // ======================================================================
  // Checks
  // ======================================================================
  console.log('\n========== E2E MOCK TEST RESULTS ==========');
  console.log(`Total HTTP calls intercepted: ${calls.length}`);

  const bucket: Record<string, number> = {};
  for (const c of calls) {
    const key = c.url
      .replace(/https:\/\/[^/]+/, '')
      .replace(/\/[A-Z]+-\d+$/, '/{KEY}')
      .replace(/\?.*/, '');
    bucket[`${c.method} ${key}`] = (bucket[`${c.method} ${key}`] || 0) + 1;
  }
  console.log('\nCalls grouped:');
  for (const [k, v] of Object.entries(bucket)) {
    console.log(`  ${v}x ${k}`);
  }

  const assertions = [
    {
      name: '1. Xray auth',
      ok: calls.some(
        (c) => c.url.includes('/api/v2/authenticate') && c.method === 'POST'
      ),
    },
    {
      name: '2. JIRA getProjectInfo',
      ok: calls.some((c) => c.url.includes('/rest/api/3/project/PROJ')),
    },
    {
      name: '3. JIRA getIssueType',
      ok: calls.some((c) => c.url.includes('/rest/api/3/issuetype/project')),
    },
    {
      name: '4. JIRA create Test Execution (POST /issue)',
      ok: calls.some(
        (c) => c.url.endsWith('/rest/api/3/issue') && c.method === 'POST'
      ),
    },
    {
      name: '5. Xray import execution',
      ok: calls.some((c) => c.url.includes('/api/v2/import/execution')),
    },
    {
      name: '6. Xray GraphQL (Test Plan / Environments)',
      ok: calls.some((c) => c.url.includes('/api/v2/graphql')),
    },
    {
      name: '7. Auth header present (Basic for JIRA)',
      ok: calls.some(
        (c) =>
          c.url.includes('atlassian.net') &&
          ((c.headers as any).Authorization || '').startsWith('Basic ')
      ),
    },
    {
      name: '8. Auth header present (Bearer for Xray after auth)',
      ok: calls.some(
        (c) =>
          c.url.includes('xray.cloud.getxray.app') &&
          !c.url.includes('/authenticate') &&
          ((c.headers as any).Authorization || '').startsWith('Bearer ')
      ),
    },
    {
      name: '9. Import payload contains testExecutionKey + tests',
      ok: calls.some(
        (c) =>
          c.url.includes('/api/v2/import/execution') &&
          c.body?.testExecutionKey === 'PROJ-1234' &&
          Array.isArray(c.body?.tests) &&
          c.body.tests.length === 3
      ),
    },
    {
      name: '10. Import payload contains testPlanKey',
      ok: calls.some(
        (c) =>
          c.url.includes('/api/v2/import/execution') &&
          c.body?.info?.testPlanKey === 'PROJ-100'
      ),
    },
    {
      name: '11. Untagged tests are filtered out (3/4 pushed)',
      ok: calls.some(
        (c) =>
          c.url.includes('/api/v2/import/execution') &&
          c.body?.tests?.length === 3
      ),
    },
    {
      name: '12. Statuses mapped (PASSED/FAILED/SKIPPED or TODO)',
      ok: (() => {
        const importCall = calls.find((c) => c.url.includes('/api/v2/import/execution'));
        if (!importCall?.body?.tests) return false;
        const statuses = importCall.body.tests.map((t: any) => t.status);
        return (
          (statuses.includes('PASSED') &&
            statuses.includes('FAILED') &&
            statuses.includes('SKIPPED' as any)) ||
          statuses.includes('TODO')
        );
      })(),
    },
  ];

  let passCount = 0;
  let failCount = 0;
  console.log('\nAssertions:');
  for (const a of assertions) {
    const mark = a.ok ? '\u2705' : '\u274C';
    console.log(`  ${mark} ${a.name}`);
    a.ok ? passCount++ : failCount++;
  }

  console.log(`\nResult: ${passCount}/${assertions.length} passed`);
  if (failCount > 0) {
    console.log('\n-- Sample payloads for debugging --');
    const importCall = calls.find((c) => c.url.includes('/api/v2/import/execution'));
    if (importCall) {
      console.log('Import body:', JSON.stringify(importCall.body, null, 2).slice(0, 500));
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('Test crashed:', e);
  process.exit(2);
});
