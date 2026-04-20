import * as fs from 'fs';
import * as path from 'path';
import {
  XrayTestResult,
  JiraAdfDocument,
  JiraAdfContent,
  JiraAdfParagraph,
  JiraAdfHeading,
  JiraAdfTable,
  JiraAdfTableRow,
  JiraAdfTableCell,
  JiraAdfTextContent,
  PlaywrightTestDetails,
} from '../types';

/**
 * Formats a date as ISO 8601 with timezone.
 */
export function formatDateISO(date: Date): string {
  return date.toISOString().replace('Z', '+00:00');
}

/**
 * Formats a duration in milliseconds as a human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Extracts the Xray key from a test title.
 * Supported patterns:
 * - "[PROJ-123] My test"
 * - "PROJ-123 - My test"
 * - "My test @PROJ-123"
 * - Custom regex pattern
 */
export function extractTestKeyFromTitle(
  title: string,
  customPattern?: RegExp
): string | null {
  // Custom pattern takes priority
  if (customPattern) {
    const match = title.match(customPattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Default patterns
  const patterns = [
    /^\[([A-Z][A-Z0-9]*-\d+)\]/, // [PROJ-123] at the start
    /^([A-Z][A-Z0-9]*-\d+)\s*[-:]/, // PROJ-123 - at the start
    /@([A-Z][A-Z0-9]*-\d+)/, // @PROJ-123 anywhere
    /\(([A-Z][A-Z0-9]*-\d+)\)$/, // (PROJ-123) at the end
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Converts a Playwright status to an Xray status.
 */
export function mapPlaywrightStatusToXray(
  status: PlaywrightTestDetails['status']
): XrayTestResult['status'] {
  switch (status) {
    case 'passed':
      return 'PASSED';
    case 'failed':
    case 'timedOut':
    case 'interrupted':
      return 'FAILED';
    case 'skipped':
      return 'SKIPPED';
    default:
      return 'TODO';
  }
}

/**
 * Creates a simple ADF document with text.
 */
export function createAdfText(text: string): JiraAdfDocument {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

/**
 * Creates an ADF paragraph.
 */
export function createAdfParagraph(
  texts: Array<{ text: string; bold?: boolean; code?: boolean }>
): JiraAdfParagraph {
  return {
    type: 'paragraph',
    content: texts.map((t) => {
      const textContent: JiraAdfTextContent = {
        type: 'text',
        text: t.text,
      };
      if (t.bold || t.code) {
        textContent.marks = [];
        if (t.bold) textContent.marks.push({ type: 'strong' });
        if (t.code) textContent.marks.push({ type: 'code' });
      }
      return textContent;
    }),
  };
}

/**
 * Creates an ADF heading.
 */
export function createAdfHeading(
  text: string,
  level: 1 | 2 | 3 | 4 | 5 | 6
): JiraAdfHeading {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  };
}

/**
 * Creates an ADF table cell.
 */
function createAdfTableCell(
  content: string,
  isHeader: boolean = false
): JiraAdfTableCell {
  const textContent: JiraAdfTextContent = {
    type: 'text',
    text: content,
  };

  if (isHeader) {
    textContent.marks = [{ type: 'strong' }];
  }

  return {
    type: isHeader ? 'tableHeader' : 'tableCell',
    content: [
      {
        type: 'paragraph',
        content: [textContent],
      },
    ],
  };
}

/**
 * Creates an ADF table from data.
 */
export function createAdfTable(
  headers: string[],
  rows: string[][]
): JiraAdfTable {
  const tableRows: JiraAdfTableRow[] = [];

  // Header row
  tableRows.push({
    type: 'tableRow',
    content: headers.map((h) => createAdfTableCell(h, true)),
  });

  // Data rows
  for (const row of rows) {
    tableRows.push({
      type: 'tableRow',
      content: row.map((cell) => createAdfTableCell(cell, false)),
    });
  }

  return {
    type: 'table',
    content: tableRows,
  };
}

/**
 * Creates a full ADF description for a Test Execution.
 */
export function createTestExecutionDescription(
  totalTests: number,
  passed: number,
  failed: number,
  skipped: number,
  duration: number,
  environments: string[],
  startTime: Date,
  playwrightVersion?: string
): JiraAdfDocument {
  const passRate = totalTests > 0 ? ((passed / totalTests) * 100).toFixed(1) : '0';

  const content: JiraAdfContent[] = [
    createAdfHeading('Playwright Execution Summary', 2),
    createAdfTable(
      ['Metric', 'Value'],
      [
        ['Total Tests', totalTests.toString()],
        ['✅ Passed', passed.toString()],
        ['❌ Failed', failed.toString()],
        ['⏭️ Skipped', skipped.toString()],
        ['📊 Pass Rate', `${passRate}%`],
        ['⏱️ Total Duration', formatDuration(duration)],
        ['🕐 Started', startTime.toISOString()],
        ['🌍 Environments', environments.join(', ') || 'N/A'],
      ]
    ),
  ];

  if (playwrightVersion) {
    content.push(
      createAdfParagraph([
        { text: 'Playwright Version: ', bold: true },
        { text: playwrightVersion, code: true },
      ])
    );
  }

  content.push(
    createAdfParagraph([
      { text: '🤖 Automated execution via playwright-xray-advanced-reporter' },
    ])
  );

  return {
    type: 'doc',
    version: 1,
    content,
  };
}

/**
 * Reads a file as base64.
 */
export function readFileAsBase64(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

/**
 * Determines the content type of a file based on its extension.
 */
export function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.webm': 'video/webm',
    '.mp4': 'video/mp4',
    '.zip': 'application/zip',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.log': 'text/plain',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Collects attachments from a test (screenshots, traces, videos).
 */
export function collectTestAttachments(
  test: PlaywrightTestDetails,
  options: {
    includeScreenshots?: boolean;
    includeTraces?: boolean;
    includeVideos?: boolean;
  }
): string[] {
  const files: string[] = [];

  for (const attachment of test.attachments) {
    if (!attachment.path) continue;

    const isScreenshot =
      attachment.name === 'screenshot' ||
      attachment.contentType.startsWith('image/');
    const isTrace =
      attachment.name === 'trace' || attachment.path.endsWith('.zip');
    const isVideo =
      attachment.name === 'video' ||
      attachment.contentType.startsWith('video/');

    if (isScreenshot && options.includeScreenshots) {
      files.push(attachment.path);
    } else if (isTrace && options.includeTraces) {
      files.push(attachment.path);
    } else if (isVideo && options.includeVideos) {
      files.push(attachment.path);
    }
  }

  return files;
}

/**
 * Generates a summary for the Test Execution.
 */
export function generateTestExecutionSummary(
  prefix: string,
  projectName: string,
  timestamp: Date
): string {
  const dateStr = timestamp.toISOString().split('T')[0];
  const timeStr = timestamp.toTimeString().split(' ')[0].replace(/:/g, '-');
  return `${prefix} - ${projectName} - ${dateStr} ${timeStr}`;
}

/**
 * Truncates an error message for Xray (max 32767 characters).
 */
export function truncateErrorMessage(
  error: string | undefined,
  maxLength: number = 5000
): string {
  if (!error) return '';
  if (error.length <= maxLength) return error;
  return error.substring(0, maxLength - 3) + '...';
}

/**
 * Logger with levels.
 */
export class Logger {
  private verbose: boolean;
  private prefix: string;

  constructor(prefix: string = '[XrayReporter]', verbose: boolean = false) {
    this.prefix = prefix;
    this.verbose = verbose;
  }

  info(message: string, ...args: unknown[]): void {
    console.log(`${this.prefix} ℹ️  ${message}`, ...args);
  }

  success(message: string, ...args: unknown[]): void {
    console.log(`${this.prefix} ✅ ${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`${this.prefix} ⚠️  ${message}`, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(`${this.prefix} ❌ ${message}`, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.verbose) {
      console.log(`${this.prefix} 🔍 ${message}`, ...args);
    }
  }
}
