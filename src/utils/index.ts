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
 * Formate une date en ISO 8601 avec timezone
 */
export function formatDateISO(date: Date): string {
  return date.toISOString().replace('Z', '+00:00');
}

/**
 * Formate une durée en millisecondes en format lisible
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
 * Extrait la clé Xray d'un titre de test
 * Patterns supportés:
 * - "[PROJ-123] Mon test"
 * - "PROJ-123 - Mon test"
 * - "Mon test @PROJ-123"
 * - Pattern regex personnalisé
 */
export function extractTestKeyFromTitle(
  title: string,
  customPattern?: RegExp
): string | null {
  // Pattern personnalisé en priorité
  if (customPattern) {
    const match = title.match(customPattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Patterns par défaut
  const patterns = [
    /^\[([A-Z][A-Z0-9]*-\d+)\]/, // [PROJ-123] au début
    /^([A-Z][A-Z0-9]*-\d+)\s*[-:]/, // PROJ-123 - au début
    /@([A-Z][A-Z0-9]*-\d+)/, // @PROJ-123 n'importe où
    /\(([A-Z][A-Z0-9]*-\d+)\)$/, // (PROJ-123) à la fin
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
 * Convertit le statut Playwright en statut Xray
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
 * Crée un document ADF simple avec du texte
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
 * Crée un paragraphe ADF
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
 * Crée un heading ADF
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
 * Crée une cellule de tableau ADF
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
 * Crée un tableau ADF à partir de données
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
 * Crée une description ADF complète pour une Test Execution
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
    createAdfHeading('Résumé Exécution Playwright', 2),
    createAdfTable(
      ['Métrique', 'Valeur'],
      [
        ['Total Tests', totalTests.toString()],
        ['✅ Passed', passed.toString()],
        ['❌ Failed', failed.toString()],
        ['⏭️ Skipped', skipped.toString()],
        ['📊 Pass Rate', `${passRate}%`],
        ['⏱️ Durée Totale', formatDuration(duration)],
        ['🕐 Démarrage', startTime.toISOString()],
        ['🌍 Environnements', environments.join(', ') || 'N/A'],
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
      { text: '🤖 Exécution automatisée via playwright-xray-advanced-reporter' },
    ])
  );

  return {
    type: 'doc',
    version: 1,
    content,
  };
}

/**
 * Lit un fichier en base64
 */
export function readFileAsBase64(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

/**
 * Détermine le content type d'un fichier basé sur son extension
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
 * Collecte les attachments d'un test (screenshots, traces, videos)
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
 * Génère un summary pour la Test Execution
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
 * Tronque un message d'erreur pour Xray (max 32767 caractères)
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
 * Logger avec niveaux
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
