/**
 * Configuration of the Xray Advanced Reporter.
 */
export interface XrayReporterConfig {
  /** URL of the JIRA instance (e.g. https://myinstance.atlassian.net) */
  jiraBaseUrl: string;
  
  /** JIRA account email */
  jiraEmail: string;
  
  /** JIRA API token */
  jiraApiToken: string;
  
  /** JIRA project key (e.g. PROJ) */
  projectKey: string;
  
  /** Xray Cloud Client ID */
  xrayClientId: string;
  
  /** Xray Cloud Client Secret */
  xrayClientSecret: string;
  
  /** Existing Test Plan key (optional - if not provided, search by summary) */
  testPlanKey?: string;
  
  /** Test Plan summary for automatic lookup */
  testPlanSummary?: string;
  
  /** Prefix for the created Test Execution summary */
  testExecutionSummaryPrefix?: string;
  
  /** Labels to add to the Test Execution */
  testExecutionLabels?: string[];
  
  /** Test environments (e.g. ['Chrome', 'Windows']) */
  testEnvironments?: string[];
  
  /** Automatic screenshot upload on failure */
  uploadScreenshotsOnFailure?: boolean;
  
  /** Automatic upload of Playwright traces */
  uploadTraces?: boolean;
  
  /** Automatic video upload */
  uploadVideos?: boolean;
  
  /** Mapping of Playwright test names to Xray keys */
  testKeyMapping?: Record<string, string>;
  
  /** Regex pattern to extract the Xray key from the test title */
  testKeyPattern?: RegExp;
  
  /** Enable verbose logs */
  verbose?: boolean;
}

/**
 * A test result formatted for Xray.
 */
export interface XrayTestResult {
  testKey: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'TODO';
  start: string;
  finish: string;
  comment?: string;
  evidences?: XrayEvidence[];
  defects?: string[];
}

/**
 * Xray attachment.
 */
export interface XrayEvidence {
  data: string;
  filename: string;
  contentType: string;
}

/**
 * Payload for importing results into Xray.
 */
export interface XrayImportPayload {
  testExecutionKey: string;
  info?: {
    testPlanKey?: string;
    summary?: string;
    description?: string;
    startDate?: string;
    finishDate?: string;
    testEnvironments?: string[];
  };
  tests: XrayTestResult[];
}

/**
 * Xray authentication response.
 */
export interface XrayAuthResponse {
  token: string;
}

/**
 * Response from a JIRA issue creation.
 */
export interface JiraIssueResponse {
  id: string;
  key: string;
  self: string;
}

/**
 * JIRA search response.
 */
export interface JiraSearchResponse {
  issues: Array<{
    id: string;
    key: string;
    fields?: Record<string, unknown>;
  }>;
  total: number;
}

/**
 * Xray GraphQL response - Get Test Plans.
 */
export interface XrayTestPlansResponse {
  data: {
    getTestPlans: {
      results: Array<{
        issueId: string;
        jira?: {
          key: string;
        };
      }>;
    };
  };
}

/**
 * Xray GraphQL response - Get Test Executions.
 */
export interface XrayTestExecutionsResponse {
  data: {
    getTestExecutions: {
      results: Array<{
        issueId: string;
        jira?: {
          key: string;
        };
      }>;
    };
  };
}

/**
 * Xray GraphQL response - Mutation.
 */
export interface XrayMutationResponse {
  data: {
    addTestExecutionsToTestPlan?: {
      addedTestExecutions: string[];
      warning: string | null;
    };
    addTestEnvironmentsToTestExecution?: {
      associatedTestEnvironments: string[];
      createdTestEnvironments: string[];
      warning: string | null;
    };
  };
}

/**
 * JIRA project.
 */
export interface JiraProject {
  id: string;
  key: string;
  name: string;
  issueTypes?: Array<{
    id: string;
    name: string;
    subtask: boolean;
  }>;
}

/**
 * Details of a Playwright test used for mapping.
 */
export interface PlaywrightTestDetails {
  title: string;
  fullTitle: string;
  file: string;
  line: number;
  column: number;
  projectName: string;
  duration: number;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';
  error?: string;
  attachments: Array<{
    name: string;
    path?: string;
    contentType: string;
    body?: Buffer;
  }>;
}

/**
 * JIRA description in ADF (Atlassian Document Format).
 */
export interface JiraAdfDocument {
  type: 'doc';
  version: 1;
  content: JiraAdfContent[];
}

export type JiraAdfContent =
  | JiraAdfParagraph
  | JiraAdfHeading
  | JiraAdfTable
  | JiraAdfBulletList
  | JiraAdfCodeBlock;

export interface JiraAdfParagraph {
  type: 'paragraph';
  content?: JiraAdfTextContent[];
}

export interface JiraAdfHeading {
  type: 'heading';
  attrs: { level: 1 | 2 | 3 | 4 | 5 | 6 };
  content?: JiraAdfTextContent[];
}

export interface JiraAdfTable {
  type: 'table';
  content: JiraAdfTableRow[];
}

export interface JiraAdfTableRow {
  type: 'tableRow';
  content: JiraAdfTableCell[];
}

export interface JiraAdfTableCell {
  type: 'tableCell' | 'tableHeader';
  content: JiraAdfContent[];
}

export interface JiraAdfBulletList {
  type: 'bulletList';
  content: JiraAdfListItem[];
}

export interface JiraAdfListItem {
  type: 'listItem';
  content: JiraAdfContent[];
}

export interface JiraAdfCodeBlock {
  type: 'codeBlock';
  attrs?: { language?: string };
  content?: JiraAdfTextContent[];
}

export interface JiraAdfTextContent {
  type: 'text';
  text: string;
  marks?: Array<{
    type: 'strong' | 'em' | 'code' | 'link';
    attrs?: { href?: string };
  }>;
}
