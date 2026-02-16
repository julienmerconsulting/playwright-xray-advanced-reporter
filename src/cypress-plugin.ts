import * as fs from 'fs';

import { JiraClient } from './clients/jira-client';
import { XrayClient } from './clients/xray-client';
import { XrayImportPayload, XrayReporterConfig, XrayTestResult } from './types';
import {
  Logger,
  createTestExecutionDescription,
  extractTestKeyFromTitle,
  formatDateISO,
  generateTestExecutionSummary,
  mapTestStatusToXray,
  truncateErrorMessage,
} from './utils';

type CypressPluginOn = (eventName: string, handler: (...args: any[]) => any) => void;

type InternalStatus = 'passed' | 'failed' | 'skipped' | 'pending' | 'timedOut' | 'interrupted';

interface CypressTestDetails {
  title: string;
  fullTitle: string;
  file: string;
  projectName: string;
  duration: number;
  status: InternalStatus;
  start: Date;
  finish: Date;
  error?: string;
}

/**
 * Plugin Cypress pour Xray Cloud.
 *
 * Utilisation dans cypress.config.ts:
 * setupNodeEvents(on, config) {
 *   registerCypressXrayReporter(on, config, { ... });
 *   return config;
 * }
 */
export class CypressXrayReporter {
  private config: XrayReporterConfig;
  private jiraClient: JiraClient;
  private xrayClient: XrayClient;
  private logger: Logger;

  private testResults: Map<string, CypressTestDetails> = new Map();
  private filesToUpload: Set<string> = new Set();

  private startTime: Date = new Date();
  private endTime: Date = new Date();
  private testExecutionKey: string | null = null;
  private testPlanKey: string | null = null;
  private projectId: string | null = null;
  private testExecutionIssueTypeId: string | null = null;

  constructor(config: XrayReporterConfig) {
    this.config = {
      testExecutionSummaryPrefix: 'Cypress Execution',
      testExecutionLabels: ['Automation', 'Cypress'],
      uploadScreenshotsOnFailure: true,
      uploadTraces: false,
      uploadVideos: false,
      verbose: false,
      ...config,
    };

    this.jiraClient = new JiraClient(
      this.config.jiraBaseUrl,
      this.config.jiraEmail,
      this.config.jiraApiToken
    );
    this.xrayClient = new XrayClient(
      this.config.xrayClientId,
      this.config.xrayClientSecret
    );

    this.logger = new Logger('[XrayCypressReporter]', this.config.verbose);
  }

  register(on: CypressPluginOn, cypressConfig?: any): void {
    on('before:run', async () => {
      await this.onRunStart();
    });

    on('after:spec', async (spec: any, results: any) => {
      this.onSpecEnd(spec, results, cypressConfig);
    });

    on('after:run', async () => {
      await this.onRunEnd(cypressConfig);
    });
  }

  private async onRunStart(): Promise<void> {
    this.startTime = new Date();
    this.testResults.clear();
    this.filesToUpload.clear();

    this.logger.info('Démarrage de l\'exécution Cypress');

    await this.xrayClient.authenticate();
    const project = await this.jiraClient.getProjectInfo(this.config.projectKey);
    this.projectId = project.id;

    this.testExecutionIssueTypeId = await this.jiraClient.getTestExecutionIssueTypeId(
      this.config.projectKey
    );

    await this.resolveTestPlan();
  }

  private onSpecEnd(spec: any, results: any, cypressConfig?: any): void {
    if (!results?.tests || !Array.isArray(results.tests)) {
      return;
    }

    const projectName =
      cypressConfig?.browser?.name ||
      cypressConfig?.browserName ||
      cypressConfig?.testingType ||
      'cypress';

    for (const test of results.tests) {
      const titleSegments: string[] = test.title || [];
      const title = titleSegments[titleSegments.length - 1] || 'Unnamed test';
      const fullTitle = titleSegments.join(' > ');
      const testKey = this.resolveTestKey(title, fullTitle);

      if (!testKey) {
        this.logger.debug(`Test ignoré (pas de clé Xray): ${fullTitle}`);
        continue;
      }

      const attempt = test.attempts?.[test.attempts.length - 1];
      const status = this.mapCypressStatusToInternal(test.state);
      const errorMessage = attempt?.error?.message || attempt?.error?.stack;
      const timing = this.extractAttemptTiming(attempt);

      const details: CypressTestDetails = {
        title,
        fullTitle,
        file: spec?.relative || spec?.name || 'unknown',
        projectName,
        duration: timing.duration,
        status,
        start: timing.start,
        finish: timing.finish,
        error: errorMessage,
      };

      this.testResults.set(testKey, details);
      this.collectAttachmentsFromSpecResults(results, status);
    }
  }

  private mapCypressStatusToInternal(state: string): InternalStatus {
    switch (state) {
      case 'passed':
        return 'passed';
      case 'failed':
        return 'failed';
      case 'pending':
        return 'pending';
      case 'skipped':
        return 'skipped';
      default:
        return 'interrupted';
    }
  }

  private extractAttemptTiming(attempt?: any): { start: Date; finish: Date; duration: number } {
    const runEnd = new Date();
    const duration = Number(attempt?.wallClockDuration) || 0;
    const startedAt = attempt?.wallClockStartedAt ? new Date(attempt.wallClockStartedAt) : null;

    if (startedAt && !Number.isNaN(startedAt.getTime())) {
      const finish = new Date(startedAt.getTime() + duration);
      return { start: startedAt, finish, duration };
    }

    const finish = runEnd;
    const start = new Date(finish.getTime() - duration);
    return { start, finish, duration };
  }

  private collectAttachmentsFromSpecResults(results: any, status: InternalStatus): void {
    if (this.config.uploadVideos && typeof results.video === 'string') {
      this.filesToUpload.add(results.video);
    }

    if (
      this.config.uploadScreenshotsOnFailure &&
      status === 'failed' &&
      Array.isArray(results.screenshots)
    ) {
      for (const screenshot of results.screenshots) {
        if (typeof screenshot?.path === 'string') {
          this.filesToUpload.add(screenshot.path);
        }
      }
    }
  }

  private resolveTestKey(title: string, fullTitle: string): string | null {
    if (this.config.testKeyMapping) {
      const mappedKey = this.config.testKeyMapping[title] || this.config.testKeyMapping[fullTitle];
      if (mappedKey) return mappedKey;
    }

    const extractedFromTitle = extractTestKeyFromTitle(title, this.config.testKeyPattern);
    if (extractedFromTitle) return extractedFromTitle;

    return extractTestKeyFromTitle(fullTitle, this.config.testKeyPattern);
  }

  private async onRunEnd(cypressConfig?: any): Promise<void> {
    this.endTime = new Date();

    if (this.testResults.size === 0) {
      this.logger.warn('Aucun test avec clé Xray trouvé. Rien à reporter.');
      return;
    }

    const duration = this.endTime.getTime() - this.startTime.getTime();

    try {
      await this.createTestExecutionInJira(duration, cypressConfig);
      await this.importResultsToXray();
      await this.linkTestExecutionToTestPlan();
      await this.addTestEnvironments(cypressConfig);
      await this.uploadAttachments();

      this.logger.success(`Reporting terminé: ${this.testExecutionKey}`);
    } catch (error) {
      this.logger.error('Erreur globale pendant le reporting Cypress:', error);
      throw error;
    }
  }

  private async resolveTestPlan(): Promise<void> {
    if (this.config.testPlanKey) {
      this.testPlanKey = this.config.testPlanKey;
      return;
    }

    if (this.config.testPlanSummary) {
      this.testPlanKey = await this.jiraClient.findTestPlanBySummary(
        this.config.testPlanSummary,
        this.config.projectKey
      );
    }
  }

  private calculateStats(): { total: number; passed: number; failed: number; skipped: number } {
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const details of this.testResults.values()) {
      if (details.status === 'passed') passed++;
      else if (details.status === 'failed' || details.status === 'timedOut' || details.status === 'interrupted') failed++;
      else if (details.status === 'skipped' || details.status === 'pending') skipped++;
    }

    return {
      total: this.testResults.size,
      passed,
      failed,
      skipped,
    };
  }

  private collectEnvironments(cypressConfig?: any): string[] {
    const environments = new Set<string>(this.config.testEnvironments || []);

    if (cypressConfig?.browser?.name) {
      environments.add(cypressConfig.browser.name);
    }

    if (cypressConfig?.testingType) {
      environments.add(cypressConfig.testingType);
    }

    for (const details of this.testResults.values()) {
      if (details.projectName) {
        environments.add(details.projectName);
      }
    }

    return Array.from(environments);
  }

  private async createTestExecutionInJira(duration: number, cypressConfig?: any): Promise<void> {
    const stats = this.calculateStats();
    const environments = this.collectEnvironments(cypressConfig);

    const summary = generateTestExecutionSummary(
      this.config.testExecutionSummaryPrefix!,
      this.config.projectKey,
      this.startTime
    );

    const description = createTestExecutionDescription(
      stats.total,
      stats.passed,
      stats.failed,
      stats.skipped,
      duration,
      environments,
      this.startTime
    );

    const response = await this.jiraClient.createTestExecution(
      this.projectId!,
      this.testExecutionIssueTypeId!,
      summary,
      this.config.testExecutionLabels,
      description
    );

    this.testExecutionKey = response.key;
  }

  private buildTestComment(details: CypressTestDetails): string {
    const lines = [
      `📁 Fichier: ${details.file}`,
      `⏱️ Durée: ${details.duration}ms`,
      `🖥️ Projet: ${details.projectName}`,
    ];

    if (details.error) {
      lines.push('', '❌ Erreur:', truncateErrorMessage(details.error, 2000));
    }

    return lines.join('\n');
  }

  private async importResultsToXray(): Promise<void> {
    const tests: XrayTestResult[] = [];

    for (const [testKey, details] of this.testResults.entries()) {
      tests.push({
        testKey,
        status: mapTestStatusToXray(details.status),
        start: formatDateISO(details.start),
        finish: formatDateISO(details.finish),
        comment: this.buildTestComment(details),
      });
    }

    const payload: XrayImportPayload = {
      testExecutionKey: this.testExecutionKey!,
      tests,
    };

    if (this.testPlanKey) {
      payload.info = { testPlanKey: this.testPlanKey };
    }

    await this.xrayClient.importExecutionResults(payload);
  }

  private async linkTestExecutionToTestPlan(): Promise<void> {
    if (!this.testPlanKey) return;

    try {
      const testPlanIssueId = await this.xrayClient.getTestPlanIssueId(this.testPlanKey);
      const testExecutionIssueId = await this.xrayClient.getTestExecutionIssueId(this.testExecutionKey!);

      if (!testPlanIssueId || !testExecutionIssueId) return;

      await this.xrayClient.addTestExecutionToTestPlan(testPlanIssueId, testExecutionIssueId);
    } catch (error) {
      this.logger.warn('Erreur liaison Test Plan:', error);
    }
  }

  private async addTestEnvironments(cypressConfig?: any): Promise<void> {
    const environments = this.collectEnvironments(cypressConfig);
    if (environments.length === 0) return;

    try {
      const testExecutionIssueId = await this.xrayClient.getTestExecutionIssueId(this.testExecutionKey!);
      if (!testExecutionIssueId) return;

      await this.xrayClient.addTestEnvironmentsToTestExecution(testExecutionIssueId, environments);
    } catch (error) {
      this.logger.warn('Erreur ajout environnements:', error);
    }
  }

  private async uploadAttachments(): Promise<void> {
    if (!this.testExecutionKey || this.filesToUpload.size === 0) {
      return;
    }

    const existingFiles = Array.from(this.filesToUpload).filter((filePath) =>
      Boolean(filePath) && fs.existsSync(filePath)
    );

    if (existingFiles.length === 0) {
      return;
    }

    await this.jiraClient.addMultipleAttachments(this.testExecutionKey, existingFiles);
  }
}

export function registerCypressXrayReporter(
  on: CypressPluginOn,
  cypressConfig: any,
  xrayConfig: XrayReporterConfig
): void {
  const reporter = new CypressXrayReporter(xrayConfig);
  reporter.register(on, cypressConfig);
}

export default registerCypressXrayReporter;
