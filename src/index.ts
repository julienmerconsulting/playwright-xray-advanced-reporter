/**
 * playwright-xray-advanced-reporter
 * 
 * Reporter Playwright avancé pour Xray Cloud avec support complet :
 * - Création automatique de Test Execution
 * - Import des résultats avec statuts détaillés
 * - Liaison Test Plan via GraphQL
 * - Gestion des environnements de test
 * - Upload des screenshots, traces et vidéos
 * 
 * @author JMer Consulting
 * @license MIT
 */

// Reporter principal
export { XrayAdvancedReporter, default } from './reporter';
export { CypressXrayReporter, registerCypressXrayReporter } from './cypress-plugin';

// Clients API
export { JiraClient } from './clients/jira-client';
export { XrayClient } from './clients/xray-client';

// Types
export type {
  XrayReporterConfig,
  XrayTestResult,
  XrayEvidence,
  XrayImportPayload,
  JiraIssueResponse,
  JiraSearchResponse,
  JiraProject,
  PlaywrightTestDetails,
  JiraAdfDocument,
} from './types';

// Utilitaires
export {
  Logger,
  formatDateISO,
  formatDuration,
  extractTestKeyFromTitle,
  mapPlaywrightStatusToXray,
  mapTestStatusToXray,
  createAdfText,
  createAdfParagraph,
  createAdfHeading,
  createAdfTable,
  createTestExecutionDescription,
  generateTestExecutionSummary,
  truncateErrorMessage,
  readFileAsBase64,
  getContentType,
  collectTestAttachments,
} from './utils';
