/**
 * playwright-xray-advanced-reporter
 *
 * Advanced Playwright reporter for Xray Cloud with full support:
 * - Automatic Test Execution creation
 * - Result import with detailed statuses
 * - Test Plan linking via GraphQL
 * - Test environments handling
 * - Uploads screenshots, traces and videos
 *
 * @author JMer Consulting
 * @license MIT
 */

// Main reporter
export { XrayAdvancedReporter, default } from './reporter';

// API clients
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

// Utilities
export {
  Logger,
  formatDateISO,
  formatDuration,
  extractTestKeyFromTitle,
  mapPlaywrightStatusToXray,
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
