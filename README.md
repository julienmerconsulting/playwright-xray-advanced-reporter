[![npm version](https://img.shields.io/npm/v/playwright-xray-advanced-reporter.svg)](https://www.npmjs.com/package/playwright-xray-advanced-reporter)
[![npm downloads](https://img.shields.io/npm/dm/playwright-xray-advanced-reporter.svg)](https://www.npmjs.com/package/playwright-xray-advanced-reporter)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![Playwright](https://img.shields.io/badge/playwright-1.20+-0A9EDC.svg)](https://playwright.dev)

# 🎭 playwright-xray-advanced-reporter

**Advanced Playwright Reporter for Xray Cloud** with complete JIRA integration.

More powerful than the official `@xray-app/reporter-playwright` plugin:
- ✅ Automatic Test Execution creation in JIRA
- ✅ Import results with detailed statuses  
- ✅ Automatic Test Plan linking via GraphQL
- ✅ Full Xray test environment management
- ✅ Automatic screenshot, trace, and video uploads
- ✅ Rich descriptions with metrics (pass rate, duration, etc.)
- ✅ Multi-browser Playwright project support

---

## 📦 Installation

### From npm (now available!)
```bash
npm install playwright-xray-advanced-reporter
```

### From GitHub
```bash
npm install github:julienmerconsulting/playwright-xray-advanced-reporter
```

### Local installation (recommended for testing)

**Option 1: External folder**
```bash
# Extract somewhere
unzip playwright-xray-advanced-reporter.zip -d C:\tools\playwright-xray-reporter

# In your Playwright project
cd your-playwright-project/
npm install C:\tools\playwright-xray-reporter
```

**Option 2: Project-embedded (recommended)**
```
your-playwright-project/
├── libs/
│   └── playwright-xray-advanced-reporter/   ← drop it here
├── tests/
├── playwright.config.ts
└── package.json
```

Then:
```bash
npm install ./libs/playwright-xray-advanced-reporter
```

### Verify installation
```bash
# Run the plugin tests
cd libs/playwright-xray-advanced-reporter
npm install
npx ts-node test-plugin.ts && npx ts-node test-integration.ts
```

---

## ⚙️ Configuration

### playwright.config.ts

```typescript
import { defineConfig } from '@playwright/test';
import type { XrayReporterConfig } from 'playwright-xray-advanced-reporter';

const xrayConfig: XrayReporterConfig = {
  // === JIRA Cloud ===
  jiraBaseUrl: 'https://your-instance.atlassian.net',
  jiraEmail: 'your.email@company.com',
  jiraApiToken: process.env.JIRA_API_TOKEN!,
  projectKey: 'PROJ',

  // === Xray Cloud ===
  xrayClientId: process.env.XRAY_CLIENT_ID!,
  xrayClientSecret: process.env.XRAY_CLIENT_SECRET!,

  // === Test Plan (optional) ===
  testPlanKey: 'PROJ-123',  // OR
  // testPlanSummary: 'My Sprint 42 Test Plan',

  // === Test Execution Options ===
  testExecutionSummaryPrefix: 'Playwright Execution',
  testExecutionLabels: ['Automation', 'Playwright', 'Regression'],

  // === Test Environments ===
  testEnvironments: ['Chrome', 'Windows'],

  // === Attachments ===
  uploadScreenshotsOnFailure: true,
  uploadTraces: true,
  uploadVideos: false,

  // === Test Key Mapping ===
  testKeyPattern: /\[([A-Z]+-\d+)\]/,  // Custom regex pattern
  // OR explicit mapping:
  // testKeyMapping: {
  //   'My login test': 'PROJ-456',
  //   'My checkout test': 'PROJ-789',
  // },

  // === Debug ===
  verbose: true,
};

export default defineConfig({
  reporter: [
    ['html'],
    ['playwright-xray-advanced-reporter', xrayConfig],
  ],
  
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
```

### Environment Variables

Create a `.env` file (don't commit):

```env
JIRA_API_TOKEN=your_jira_token
XRAY_CLIENT_ID=your_xray_client_id
XRAY_CLIENT_SECRET=your_xray_client_secret
```

---

## 🏷️ Test Naming

Link tests to Xray by including the test key in the title:

```typescript
// ✅ Supported patterns
test('[PROJ-123] Check login flow', async ({ page }) => { ... });
test('PROJ-123 - Check login flow', async ({ page }) => { ... });
test('Check login flow @PROJ-123', async ({ page }) => { ... });
test('Check login flow (PROJ-123)', async ({ page }) => { ... });

// ✅ Or via describe blocks
test.describe('[PROJ-100] Auth Module', () => {
  test('[PROJ-123] Valid login', async ({ page }) => { ... });
  test('[PROJ-124] Invalid credentials', async ({ page }) => { ... });
});
```

---

## 🚀 Key Features

### Automatic Test Execution Creation

On every run, the reporter:
1. Creates a new "Test Execution" issue in JIRA
2. Adds configured labels
3. Generates a description with metrics table:
   - Total tests / Passed / Failed / Skipped
   - Pass rate percentage
   - Total duration
   - Test environments used

### Result Import to Xray

Results are imported via Xray REST API:
- Statuses: PASSED, FAILED, SKIPPED, TODO
- Start/end timestamps
- Comments with file, line, and error details

### Test Plan Linking

If a Test Plan is configured, the reporter:
1. Fetches the Xray issueId via GraphQL
2. Associates the Test Execution with the Test Plan
3. Results appear in the Test Plan view

### Test Environments

Environments are added automatically:
- From the `testEnvironments` config
- From Playwright project names (`chromium`, `firefox`, etc.)

### Attachment Uploads

On test failures, the reporter can upload:
- Screenshots (via JIRA API)
- Playwright traces (`.zip`)
- Test execution videos

---

## 🔌 Advanced API Usage

Use the clients directly for more control:

```typescript
import { JiraClient, XrayClient } from 'playwright-xray-advanced-reporter';

// JIRA Client
const jira = new JiraClient(baseUrl, email, apiToken);
await jira.searchIssuesByJql('project = PROJ AND type = Bug');
await jira.addAttachment('PROJ-123', './screenshot.png');

// Xray Client
const xray = new XrayClient(clientId, clientSecret);
await xray.authenticate();
const testPlanId = await xray.getTestPlanIssueId('PROJ-100');
await xray.addTestEnvironmentsToTestExecution(execId, ['Chrome', 'Linux']);
```

---

## 📊 Feature Comparison

| Feature | @xray-app/junit-reporter | playwright-xray (inluxc) | This Plugin |
|---------|--------------------------|--------------------------|-----------|
| Import results | ✅ (via XML) | ✅ | ✅ |
| Auto Test Execution | ❌ Manual | ✅ | ✅ |
| Test Plan linking | ❌ | ✅ | ✅ GraphQL |
| Environments | ❌ | ✅ | ✅ Auto from PW projects |
| JIRA attachments | ❌ | ❌ | ✅ |
| Rich ADF descriptions | ❌ | ❌ | ✅ |
| Multi-project in 1 run | ✅ | ❌ (1st only) | ✅ |
| Key extraction patterns | Via annotations | 1 pattern | 4 patterns + custom + mapping |

---

## 🔧 Troubleshooting

### "Test Execution type not found"

Make sure Xray is installed on your JIRA project and the "Test Execution" issue type exists.

### "Authentication failed"

- **JIRA**: Create an API token at https://id.atlassian.com/manage-profile/security/api-tokens
- **Xray**: Create API keys at https://xray.cloud.getxray.app/settings/api-keys

### "Test key not found"

Ensure:
1. The test exists in Xray with that key
2. Your regex pattern correctly captures the key
3. Enable `verbose: true` to see detected keys

---

## 📄 License

MIT - JMer Consulting

---

**Questions? Found a bug?** Open an issue on [GitHub](https://github.com/julienmerconsulting/playwright-xray-advanced-reporter) 🙌
