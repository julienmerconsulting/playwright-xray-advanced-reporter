import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

import { JiraClient } from './clients/jira-client';
import { XrayClient } from './clients/xray-client';
import {
  XrayReporterConfig,
  XrayTestResult,
  XrayImportPayload,
  PlaywrightTestDetails,
} from './types';
import {
  Logger,
  formatDateISO,
  extractTestKeyFromTitle,
  mapPlaywrightStatusToXray,
  createTestExecutionDescription,
  generateTestExecutionSummary,
  truncateErrorMessage,
  collectTestAttachments,
} from './utils';

/**
 * Advanced Playwright reporter for Xray Cloud.
 *
 * Features:
 * - Automatic Test Execution creation in JIRA
 * - Imports results to Xray with detailed statuses
 * - Automatic linking to a Test Plan
 * - Test environments handling
 * - Uploads screenshots, traces and videos
 * - Rich description with metrics
 */
export class XrayAdvancedReporter implements Reporter {
  private config: XrayReporterConfig;
  private jiraClient: JiraClient;
  private xrayClient: XrayClient;
  private logger: Logger;

  private testResults: Map<string, PlaywrightTestDetails> = new Map();
  private startTime: Date = new Date();
  private endTime: Date = new Date();

  private testExecutionKey: string | null = null;
  private testPlanKey: string | null = null;
  private projectId: string | null = null;
  private testExecutionIssueTypeId: string | null = null;

  constructor(config: XrayReporterConfig) {
    this.config = {
      testExecutionSummaryPrefix: 'Playwright Execution',
      testExecutionLabels: ['Automation', 'Playwright'],
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

    this.logger = new Logger('[XrayReporter]', this.config.verbose);
  }

  /**
   * Called at the start of the execution.
   */
  async onBegin(config: FullConfig, suite: Suite): Promise<void> {
    this.startTime = new Date();
    this.logger.info('Starting Playwright execution');
    this.logger.debug(`Configuration: ${JSON.stringify(this.config, null, 2)}`);

    try {
      // Xray authentication
      await this.xrayClient.authenticate();
      this.logger.success('Xray authentication successful');

      // Fetch project information
      const project = await this.jiraClient.getProjectInfo(this.config.projectKey);
      this.projectId = project.id;
      this.logger.debug(`JIRA project: ${project.name} (${project.id})`);

      // Fetch the Test Execution issue type
      this.testExecutionIssueTypeId = await this.jiraClient.getTestExecutionIssueTypeId(
        this.config.projectKey
      );
      this.logger.debug(`Test Execution type ID: ${this.testExecutionIssueTypeId}`);

      // Resolve the Test Plan
      await this.resolveTestPlan();

    } catch (error) {
      this.logger.error('Initialization error:', error);
      throw error;
    }
  }

  /**
   * Resolves the Test Plan key (provided or searched).
   */
  private async resolveTestPlan(): Promise<void> {
    if (this.config.testPlanKey) {
      this.testPlanKey = this.config.testPlanKey;
      this.logger.info(`Test Plan configured: ${this.testPlanKey}`);
    } else if (this.config.testPlanSummary) {
      this.testPlanKey = await this.jiraClient.findTestPlanBySummary(
        this.config.testPlanSummary,
        this.config.projectKey
      );
      if (this.testPlanKey) {
        this.logger.info(`Test Plan found by summary: ${this.testPlanKey}`);
      } else {
        this.logger.warn(
          `Test Plan not found for summary: "${this.config.testPlanSummary}"`
        );
      }
    }
  }

  /**
   * Called at the end of each test.
   */
  onTestEnd(test: TestCase, result: TestResult): void {
    const testKey = this.resolveTestKey(test);
    
    if (!testKey) {
      this.logger.debug(`Test skipped (no Xray key): ${test.title}`);
      return;
    }

    const details: PlaywrightTestDetails = {
      title: test.title,
      fullTitle: test.titlePath().join(' > '),
      file: test.location.file,
      line: test.location.line,
      column: test.location.column,
      projectName: test.parent?.project()?.name || 'default',
      duration: result.duration,
      status: result.status,
      error: result.error?.message,
      attachments: result.attachments.map((a) => ({
        name: a.name,
        path: a.path,
        contentType: a.contentType,
        body: a.body,
      })),
    };

    this.testResults.set(testKey, details);
    
    const statusEmoji = result.status === 'passed' ? '✅' :
                        result.status === 'failed' ? '❌' : '⏭️';
    this.logger.debug(`${statusEmoji} ${testKey}: ${test.title} (${result.duration}ms)`);
  }

  /**
   * Resolves the Xray key of a test.
   */
  private resolveTestKey(test: TestCase): string | null {
    // 1. Explicit mapping
    if (this.config.testKeyMapping) {
      const mappedKey = this.config.testKeyMapping[test.title];
      if (mappedKey) return mappedKey;
    }

    // 2. Extraction from the title
    const extractedKey = extractTestKeyFromTitle(
      test.title,
      this.config.testKeyPattern
    );
    if (extractedKey) return extractedKey;

    // 3. Extraction from the fullTitle
    const fullTitle = test.titlePath().join(' ');
    return extractTestKeyFromTitle(fullTitle, this.config.testKeyPattern);
  }

  /**
   * Called at the end of the full execution.
   */
  async onEnd(result: FullResult): Promise<void> {
    this.endTime = new Date();
    const totalDuration = this.endTime.getTime() - this.startTime.getTime();

    this.logger.info(`Execution finished: ${result.status}`);
    this.logger.info(`Tests with Xray key: ${this.testResults.size}`);

    if (this.testResults.size === 0) {
      this.logger.warn('No test with Xray key found. Nothing to report.');
      return;
    }

    try {
      // Create the Test Execution in JIRA
      await this.createTestExecutionInJira(totalDuration);

      // Import results into Xray
      await this.importResultsToXray();

      // Link to the Test Plan via GraphQL
      await this.linkTestExecutionToTestPlan();

      // Add environments
      await this.addTestEnvironments();

      // Upload attachments
      await this.uploadAttachments();

      this.logger.success(`Reporting finished: ${this.testExecutionKey}`);
      this.logger.info(
        `🔗 ${this.config.jiraBaseUrl}/browse/${this.testExecutionKey}`
      );

    } catch (error) {
      this.logger.error('Error during reporting:', error);
      throw error;
    }
  }

  /**
   * Creates the Test Execution in JIRA.
   */
  private async createTestExecutionInJira(totalDuration: number): Promise<void> {
    const stats = this.calculateStats();
    const environments = this.collectEnvironments();

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
      totalDuration,
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
    this.logger.success(`Test Execution created: ${this.testExecutionKey}`);
  }

  /**
   * Calculates test statistics.
   */
  private calculateStats(): { total: number; passed: number; failed: number; skipped: number } {
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const details of this.testResults.values()) {
      switch (details.status) {
        case 'passed':
          passed++;
          break;
        case 'failed':
        case 'timedOut':
        case 'interrupted':
          failed++;
          break;
        case 'skipped':
          skipped++;
          break;
      }
    }

    return {
      total: this.testResults.size,
      passed,
      failed,
      skipped,
    };
  }

  /**
   * Collects unique environments from tests.
   */
  private collectEnvironments(): string[] {
    const envs = new Set<string>();

    // Configured environments
    if (this.config.testEnvironments) {
      this.config.testEnvironments.forEach((e) => envs.add(e));
    }

    // Environments from Playwright projects
    for (const details of this.testResults.values()) {
      if (details.projectName && details.projectName !== 'default') {
        envs.add(details.projectName);
      }
    }

    return Array.from(envs);
  }

  /**
   * Imports results into Xray.
   */
  private async importResultsToXray(): Promise<void> {
    const tests: XrayTestResult[] = [];

    for (const [testKey, details] of this.testResults) {
      const xrayResult: XrayTestResult = {
        testKey,
        status: mapPlaywrightStatusToXray(details.status),
        start: formatDateISO(this.startTime),
        finish: formatDateISO(this.endTime),
        comment: this.buildTestComment(details),
      };

      tests.push(xrayResult);
    }

    const payload: XrayImportPayload = {
      testExecutionKey: this.testExecutionKey!,
      tests,
    };

    // Add the Test Plan if available
    if (this.testPlanKey) {
      payload.info = {
        testPlanKey: this.testPlanKey,
      };
    }

    await this.xrayClient.importExecutionResults(payload);
    this.logger.success(`${tests.length} results imported into Xray`);
  }

  /**
   * Builds the comment for a test.
   */
  private buildTestComment(details: PlaywrightTestDetails): string {
    const lines: string[] = [];

    lines.push(`📁 File: ${details.file}:${details.line}`);
    lines.push(`⏱️ Duration: ${details.duration}ms`);
    lines.push(`🖥️ Project: ${details.projectName}`);

    if (details.error) {
      lines.push('');
      lines.push('❌ Error:');
      lines.push(truncateErrorMessage(details.error, 2000));
    }

    return lines.join('\n');
  }

  /**
   * Links the Test Execution to the Test Plan via GraphQL.
   */
  private async linkTestExecutionToTestPlan(): Promise<void> {
    if (!this.testPlanKey) {
      this.logger.debug('No Test Plan configured, linking skipped');
      return;
    }

    try {
      // Fetch Xray issueIds
      const testPlanIssueId = await this.xrayClient.getTestPlanIssueId(
        this.testPlanKey
      );
      const testExecIssueId = await this.xrayClient.getTestExecutionIssueId(
        this.testExecutionKey!
      );

      if (!testPlanIssueId || !testExecIssueId) {
        this.logger.warn('Unable to fetch Xray issueIds');
        return;
      }

      await this.xrayClient.addTestExecutionToTestPlan(
        testPlanIssueId,
        testExecIssueId
      );

      this.logger.success(
        `Test Execution linked to Test Plan ${this.testPlanKey}`
      );

    } catch (error) {
      this.logger.warn('Test Plan linking error:', error);
    }
  }

  /**
   * Adds environments to the Test Execution.
   */
  private async addTestEnvironments(): Promise<void> {
    const environments = this.collectEnvironments();

    if (environments.length === 0) {
      return;
    }

    try {
      const testExecIssueId = await this.xrayClient.getTestExecutionIssueId(
        this.testExecutionKey!
      );

      if (!testExecIssueId) {
        this.logger.warn('Unable to fetch issueId for environments');
        return;
      }

      await this.xrayClient.addTestEnvironmentsToTestExecution(
        testExecIssueId,
        environments
      );

      this.logger.success(`Environments added: ${environments.join(', ')}`);

    } catch (error) {
      this.logger.warn('Error adding environments:', error);
    }
  }

  /**
   * Uploads attachments (screenshots, traces, videos).
   */
  private async uploadAttachments(): Promise<void> {
    if (
      !this.config.uploadScreenshotsOnFailure &&
      !this.config.uploadTraces &&
      !this.config.uploadVideos
    ) {
      return;
    }

    const filesToUpload: string[] = [];

    for (const details of this.testResults.values()) {
      // Screenshots only on failure when configured
      const includeScreenshots =
        this.config.uploadScreenshotsOnFailure &&
        (details.status === 'failed' || details.status === 'timedOut');

      const attachments = collectTestAttachments(details, {
        includeScreenshots,
        includeTraces: this.config.uploadTraces,
        includeVideos: this.config.uploadVideos,
      });

      filesToUpload.push(...attachments);
    }

    if (filesToUpload.length === 0) {
      return;
    }

    this.logger.info(`Uploading ${filesToUpload.length} attachments...`);

    const result = await this.jiraClient.addMultipleAttachments(
      this.testExecutionKey!,
      filesToUpload
    );

    if (result.success.length > 0) {
      this.logger.success(`${result.success.length} attachments uploaded`);
    }

    if (result.failed.length > 0) {
      this.logger.warn(`${result.failed.length} attachments failed`);
    }
  }

  /**
   * Prints a summary to the console.
   */
  printsToStdio(): boolean {
    return true;
  }
}

export default XrayAdvancedReporter;
