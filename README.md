<div align="center">

# playwright-xray-advanced-reporter

**Advanced Xray Cloud reporter for Playwright — everything the official plugin is missing.**

[![npm version](https://img.shields.io/npm/v/playwright-xray-advanced-reporter.svg)](https://www.npmjs.com/package/playwright-xray-advanced-reporter)
[![npm downloads](https://img.shields.io/npm/dm/playwright-xray-advanced-reporter.svg)](https://www.npmjs.com/package/playwright-xray-advanced-reporter)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/playwright-1.20+-0A9EDC.svg)](https://playwright.dev)

</div>

---

## Why this plugin

The official `@xray-app/reporter-playwright` works for a minimal Xray setup, but in a real QA pipeline you end up doing **4 manual steps after every test run**:

1. Create a Test Execution in JIRA by hand
2. Upload screenshots, traces and videos one by one
3. Link the execution to the right Test Plan
4. Write the description with pass rate, environment, duration

This reporter does **all four automatically**, in a single `npx playwright test` invocation.

## Before vs After

**Before** (official `@xray-app/reporter-playwright`)
```
$ npx playwright test
  ✓ 42 tests passed
  ✗ 3 failed

→ Then manually in JIRA:
  1. Click "Create issue" → "Test Execution"
  2. Attach 3 screenshots (drag-drop one by one)
  3. Link to Test Plan PROJ-100 (search, click, confirm)
  4. Paste pass rate, duration, environment
  ≈ 10 minutes per run, every run, for every dev
```

**After** (`playwright-xray-advanced-reporter`)
```
$ npx playwright test
  ✓ 42 tests passed
  ✗ 3 failed
  ✓ Test Execution PROJ-1234 created
  ✓ 3 screenshots uploaded to JIRA
  ✓ Linked to Test Plan PROJ-100 (GraphQL)
  ✓ Description: 93.3% pass rate, 2m 14s, env=Chrome/Windows

→ 0 manual steps. Done.
```

## Feature comparison

| Feature                          | `@xray-app/reporter-playwright` | `playwright-xray` (inluxc) | **This plugin**                |
| -------------------------------- | :-----------------------------: | :------------------------: | :----------------------------: |
| Import results                   | ✅ (via XML)                    | ✅                         | ✅                             |
| Auto Test Execution creation     | ❌ Manual                       | ✅                         | ✅                             |
| Test Plan linking                | ❌                              | ✅                         | ✅ **via GraphQL**             |
| Test environments                | ❌                              | ✅                         | ✅ **Auto from PW projects**   |
| JIRA screenshot uploads          | ❌                              | ❌                         | ✅                             |
| Trace / video uploads            | ❌                              | ❌                         | ✅                             |
| Rich ADF descriptions + metrics  | ❌                              | ❌                         | ✅                             |
| Multi-Playwright-project in 1 run| ✅                              | ❌ (1st only)              | ✅                             |
| Test key extraction patterns     | Via annotations                 | 1 pattern                  | **4 patterns + custom + map**  |

## Install

```bash
npm install playwright-xray-advanced-reporter
```

## Quickstart

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';
import type { XrayReporterConfig } from 'playwright-xray-advanced-reporter';

const xray: XrayReporterConfig = {
  jiraBaseUrl: 'https://your-company.atlassian.net',
  jiraEmail: 'you@company.com',
  jiraApiToken: process.env.JIRA_API_TOKEN!,
  projectKey: 'PROJ',

  xrayClientId: process.env.XRAY_CLIENT_ID!,
  xrayClientSecret: process.env.XRAY_CLIENT_SECRET!,

  testPlanKey: 'PROJ-100',
  testEnvironments: ['Chrome', 'Windows'],
  uploadScreenshotsOnFailure: true,
};

export default defineConfig({
  reporter: [
    ['html'],
    ['playwright-xray-advanced-reporter', xray],
  ],
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
```

Tag your tests with any of these patterns:

```typescript
test('[PROJ-123] Login flow', ...);       // bracket style
test('PROJ-123 - Login flow', ...);       // dash style
test('Login flow @PROJ-123', ...);        // @mention
test('Login flow (PROJ-123)', ...);       // parenthesis
```

Or map them explicitly:

```typescript
testKeyMapping: {
  'Login flow': 'PROJ-123',
  'Checkout flow': 'PROJ-456',
}
```

Run:

```bash
JIRA_API_TOKEN=... XRAY_CLIENT_ID=... XRAY_CLIENT_SECRET=... npx playwright test
```

The reporter creates the Test Execution, uploads artifacts, links the Test Plan, and prints the JIRA URL in the console.

## What you get in JIRA

Each run produces a **Test Execution issue** with:

- **Summary** : `Playwright Execution - 2026-04-20 21:30 UTC`
- **Labels** : `Automation`, `Playwright`, plus any you configure
- **Description** (ADF rich format) :
  - Pass rate progress bar
  - Total / Passed / Failed / Skipped table
  - Total duration
  - Test environments used
  - Per-project breakdown (Chromium, Firefox, WebKit…)
- **Test results** imported with `PASSED` / `FAILED` / `SKIPPED` / `TODO`
- **Attachments** :
  - Screenshots (via JIRA REST API)
  - Playwright traces (`.zip`)
  - Videos (optional)
- **Test Plan linking** (automatic, via Xray GraphQL)

## Full config reference

```typescript
interface XrayReporterConfig {
  // === JIRA Cloud ===
  jiraBaseUrl: string;        // https://your-company.atlassian.net
  jiraEmail: string;
  jiraApiToken: string;       // from id.atlassian.com
  projectKey: string;         // e.g. 'PROJ'

  // === Xray Cloud ===
  xrayClientId: string;       // from xray.cloud.getxray.app/settings/api-keys
  xrayClientSecret: string;

  // === Test Plan (optional) ===
  testPlanKey?: string;                      // 'PROJ-100'
  testPlanSummary?: string;                  // or search by summary

  // === Test Execution ===
  testExecutionSummaryPrefix?: string;       // default: 'Playwright Execution'
  testExecutionLabels?: string[];            // default: ['Automation', 'Playwright']
  testEnvironments?: string[];               // e.g. ['Chrome', 'Windows']

  // === Attachments ===
  uploadScreenshotsOnFailure?: boolean;      // default: true
  uploadTraces?: boolean;                    // default: false
  uploadVideos?: boolean;                    // default: false

  // === Test key mapping ===
  testKeyPattern?: RegExp;                   // custom regex, default covers 4 styles
  testKeyMapping?: Record<string, string>;   // explicit map by test title

  // === Debug ===
  verbose?: boolean;                         // default: false
}
```

## Advanced API usage

The clients are exported for custom integrations:

```typescript
import { JiraClient, XrayClient } from 'playwright-xray-advanced-reporter';

const jira = new JiraClient(baseUrl, email, apiToken);
await jira.searchIssuesByJql('project = PROJ AND type = Bug');
await jira.addAttachment('PROJ-123', './screenshot.png');

const xray = new XrayClient(clientId, clientSecret);
await xray.authenticate();
const testPlanId = await xray.getTestPlanIssueId('PROJ-100');
await xray.addTestEnvironmentsToTestExecution(execId, ['Chrome', 'Linux']);
```

## Troubleshooting

**`Test Execution type not found`**
Make sure Xray is installed on your JIRA project and the "Test Execution" issue type is enabled in the project's issue type scheme.

**`Authentication failed`**
- JIRA token : https://id.atlassian.com/manage-profile/security/api-tokens
- Xray keys : https://xray.cloud.getxray.app/settings/api-keys

**`Test key not found`**
Enable `verbose: true` to see which pattern matched and which key was extracted. Or switch to `testKeyMapping` for an explicit dictionary.

**Multi-project runs and test keys**
Same Xray key can be mapped to tests across several Playwright projects (`chromium`, `firefox`, `webkit`). Each project is imported as a separate test run tied to the same Xray Test.

## Development

Run the bundled E2E mock test (no network, mocks `fetch` against JIRA + Xray):

```bash
npm install
npm test
```

`npm test` runs with `HTTP_VERBOSE=1` by default, so every intercepted request is printed live with its method, URL and body — useful to inspect the exact payloads sent to JIRA and Xray.

To silence the per-request logs and see only the assertion summary:

```bash
cross-env HTTP_VERBOSE=0 ts-node tests/e2e-mock.test.ts
```

To also disable the Reporter's own `🔍 debug` logs, flip `verbose: false` in the test config (`tests/e2e-mock.test.ts`).

## Compatibility

- **Playwright** `>= 1.20.0`
- **Node.js** `>= 18`
- **Xray** Cloud (Server/DC not supported — PRs welcome)
- **JIRA** Cloud

## Contributing

PRs welcome for :
- Extra test key patterns
- Xray DC/Server support
- Additional reporters (custom Slack/Teams notifications tied to the Test Execution)

Open an issue first if the change is non-trivial.

## License

MIT © [JMer Consulting](https://github.com/julienmerconsulting)

---

<div align="center">

**Questions? Found a bug?** [Open an issue](https://github.com/julienmerconsulting/playwright-xray-advanced-reporter/issues) 🙌

</div>
