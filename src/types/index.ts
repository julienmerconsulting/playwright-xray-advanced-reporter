/**
 * Configuration du Reporter Xray Advanced
 */
export interface XrayReporterConfig {
  /** URL de l'instance JIRA (ex: https://moninstance.atlassian.net) */
  jiraBaseUrl: string;
  
  /** Email du compte JIRA */
  jiraEmail: string;
  
  /** Token API JIRA */
  jiraApiToken: string;
  
  /** Clé du projet JIRA (ex: PROJ) */
  projectKey: string;
  
  /** Client ID Xray Cloud */
  xrayClientId: string;
  
  /** Client Secret Xray Cloud */
  xrayClientSecret: string;
  
  /** Clé du Test Plan existant (optionnel - si non fourni, recherche par summary) */
  testPlanKey?: string;
  
  /** Summary du Test Plan pour recherche automatique */
  testPlanSummary?: string;
  
  /** Préfixe pour le summary de la Test Execution créée */
  testExecutionSummaryPrefix?: string;
  
  /** Labels à ajouter à la Test Execution */
  testExecutionLabels?: string[];
  
  /** Environnements de test (ex: ['Chrome', 'Windows']) */
  testEnvironments?: string[];
  
  /** Upload automatique des screenshots en cas d'échec */
  uploadScreenshotsOnFailure?: boolean;
  
  /** Upload automatique des traces Playwright */
  uploadTraces?: boolean;
  
  /** Upload automatique des vidéos */
  uploadVideos?: boolean;
  
  /** Mapping des noms de tests Playwright vers les clés Xray */
  testKeyMapping?: Record<string, string>;
  
  /** Pattern regex pour extraire la clé Xray du titre du test */
  testKeyPattern?: RegExp;
  
  /** Activer les logs détaillés */
  verbose?: boolean;
}

/**
 * Résultat d'un test formaté pour Xray
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
 * Pièce jointe Xray
 */
export interface XrayEvidence {
  data: string;
  filename: string;
  contentType: string;
}

/**
 * Payload d'import des résultats Xray
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
 * Réponse d'authentification Xray
 */
export interface XrayAuthResponse {
  token: string;
}

/**
 * Réponse de création d'issue JIRA
 */
export interface JiraIssueResponse {
  id: string;
  key: string;
  self: string;
}

/**
 * Réponse de recherche JIRA
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
 * Réponse GraphQL Xray - Get Test Plans
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
 * Réponse GraphQL Xray - Get Test Executions
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
 * Réponse GraphQL Xray - Mutation
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
 * Projet JIRA
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
 * Détails d'un test Playwright pour le mapping
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
 * Description JIRA au format ADF (Atlassian Document Format)
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
