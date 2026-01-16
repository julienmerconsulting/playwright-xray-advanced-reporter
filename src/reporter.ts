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
 * Reporter Playwright avancé pour Xray Cloud
 * 
 * Fonctionnalités :
 * - Création automatique de Test Execution dans JIRA
 * - Import des résultats vers Xray avec statuts détaillés
 * - Liaison automatique au Test Plan
 * - Gestion des environnements de test
 * - Upload des screenshots, traces et vidéos
 * - Description enrichie avec métriques
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
   * Appelé au début de l'exécution
   */
  async onBegin(config: FullConfig, suite: Suite): Promise<void> {
    this.startTime = new Date();
    this.logger.info('Démarrage de l\'exécution Playwright');
    this.logger.debug(`Configuration: ${JSON.stringify(this.config, null, 2)}`);

    try {
      // Authentification Xray
      await this.xrayClient.authenticate();
      this.logger.success('Authentification Xray réussie');

      // Récupération des infos projet
      const project = await this.jiraClient.getProjectInfo(this.config.projectKey);
      this.projectId = project.id;
      this.logger.debug(`Projet JIRA: ${project.name} (${project.id})`);

      // Récupération du type Test Execution
      this.testExecutionIssueTypeId = await this.jiraClient.getTestExecutionIssueTypeId(
        this.config.projectKey
      );
      this.logger.debug(`Type Test Execution ID: ${this.testExecutionIssueTypeId}`);

      // Résolution du Test Plan
      await this.resolveTestPlan();

    } catch (error) {
      this.logger.error('Erreur initialisation:', error);
      throw error;
    }
  }

  /**
   * Résout la clé du Test Plan (fournie ou recherchée)
   */
  private async resolveTestPlan(): Promise<void> {
    if (this.config.testPlanKey) {
      this.testPlanKey = this.config.testPlanKey;
      this.logger.info(`Test Plan configuré: ${this.testPlanKey}`);
    } else if (this.config.testPlanSummary) {
      this.testPlanKey = await this.jiraClient.findTestPlanBySummary(
        this.config.testPlanSummary,
        this.config.projectKey
      );
      if (this.testPlanKey) {
        this.logger.info(`Test Plan trouvé par summary: ${this.testPlanKey}`);
      } else {
        this.logger.warn(
          `Test Plan non trouvé pour summary: "${this.config.testPlanSummary}"`
        );
      }
    }
  }

  /**
   * Appelé à la fin de chaque test
   */
  onTestEnd(test: TestCase, result: TestResult): void {
    const testKey = this.resolveTestKey(test);
    
    if (!testKey) {
      this.logger.debug(`Test ignoré (pas de clé Xray): ${test.title}`);
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
   * Résout la clé Xray d'un test
   */
  private resolveTestKey(test: TestCase): string | null {
    // 1. Mapping explicite
    if (this.config.testKeyMapping) {
      const mappedKey = this.config.testKeyMapping[test.title];
      if (mappedKey) return mappedKey;
    }

    // 2. Extraction depuis le titre
    const extractedKey = extractTestKeyFromTitle(
      test.title,
      this.config.testKeyPattern
    );
    if (extractedKey) return extractedKey;

    // 3. Extraction depuis le fullTitle
    const fullTitle = test.titlePath().join(' ');
    return extractTestKeyFromTitle(fullTitle, this.config.testKeyPattern);
  }

  /**
   * Appelé à la fin de l'exécution complète
   */
  async onEnd(result: FullResult): Promise<void> {
    this.endTime = new Date();
    const totalDuration = this.endTime.getTime() - this.startTime.getTime();

    this.logger.info(`Exécution terminée: ${result.status}`);
    this.logger.info(`Tests avec clé Xray: ${this.testResults.size}`);

    if (this.testResults.size === 0) {
      this.logger.warn('Aucun test avec clé Xray trouvé. Rien à reporter.');
      return;
    }

    try {
      // Création de la Test Execution dans JIRA
      await this.createTestExecutionInJira(totalDuration);

      // Import des résultats dans Xray
      await this.importResultsToXray();

      // Liaison au Test Plan via GraphQL
      await this.linkTestExecutionToTestPlan();

      // Ajout des environnements
      await this.addTestEnvironments();

      // Upload des attachments
      await this.uploadAttachments();

      this.logger.success(`Reporting terminé: ${this.testExecutionKey}`);
      this.logger.info(
        `🔗 ${this.config.jiraBaseUrl}/browse/${this.testExecutionKey}`
      );

    } catch (error) {
      this.logger.error('Erreur lors du reporting:', error);
      throw error;
    }
  }

  /**
   * Crée la Test Execution dans JIRA
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
    this.logger.success(`Test Execution créée: ${this.testExecutionKey}`);
  }

  /**
   * Calcule les statistiques des tests
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
   * Collecte les environnements uniques des tests
   */
  private collectEnvironments(): string[] {
    const envs = new Set<string>();

    // Environnements configurés
    if (this.config.testEnvironments) {
      this.config.testEnvironments.forEach((e) => envs.add(e));
    }

    // Environnements depuis les projets Playwright
    for (const details of this.testResults.values()) {
      if (details.projectName && details.projectName !== 'default') {
        envs.add(details.projectName);
      }
    }

    return Array.from(envs);
  }

  /**
   * Import les résultats vers Xray
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

    // Ajouter le Test Plan si disponible
    if (this.testPlanKey) {
      payload.info = {
        testPlanKey: this.testPlanKey,
      };
    }

    await this.xrayClient.importExecutionResults(payload);
    this.logger.success(`${tests.length} résultats importés dans Xray`);
  }

  /**
   * Construit le commentaire pour un test
   */
  private buildTestComment(details: PlaywrightTestDetails): string {
    const lines: string[] = [];

    lines.push(`📁 Fichier: ${details.file}:${details.line}`);
    lines.push(`⏱️ Durée: ${details.duration}ms`);
    lines.push(`🖥️ Projet: ${details.projectName}`);

    if (details.error) {
      lines.push('');
      lines.push('❌ Erreur:');
      lines.push(truncateErrorMessage(details.error, 2000));
    }

    return lines.join('\n');
  }

  /**
   * Lie la Test Execution au Test Plan via GraphQL
   */
  private async linkTestExecutionToTestPlan(): Promise<void> {
    if (!this.testPlanKey) {
      this.logger.debug('Pas de Test Plan configuré, liaison ignorée');
      return;
    }

    try {
      // Récupérer les issueIds Xray
      const testPlanIssueId = await this.xrayClient.getTestPlanIssueId(
        this.testPlanKey
      );
      const testExecIssueId = await this.xrayClient.getTestExecutionIssueId(
        this.testExecutionKey!
      );

      if (!testPlanIssueId || !testExecIssueId) {
        this.logger.warn('Impossible de récupérer les issueIds Xray');
        return;
      }

      await this.xrayClient.addTestExecutionToTestPlan(
        testPlanIssueId,
        testExecIssueId
      );

      this.logger.success(
        `Test Execution liée au Test Plan ${this.testPlanKey}`
      );

    } catch (error) {
      this.logger.warn('Erreur liaison Test Plan:', error);
    }
  }

  /**
   * Ajoute les environnements à la Test Execution
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
        this.logger.warn('Impossible de récupérer issueId pour les environnements');
        return;
      }

      await this.xrayClient.addTestEnvironmentsToTestExecution(
        testExecIssueId,
        environments
      );

      this.logger.success(`Environnements ajoutés: ${environments.join(', ')}`);

    } catch (error) {
      this.logger.warn('Erreur ajout environnements:', error);
    }
  }

  /**
   * Upload les attachments (screenshots, traces, vidéos)
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
      // Screenshots uniquement en cas d'échec si configuré ainsi
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

    this.logger.info(`Upload de ${filesToUpload.length} attachments...`);

    const result = await this.jiraClient.addMultipleAttachments(
      this.testExecutionKey!,
      filesToUpload
    );

    if (result.success.length > 0) {
      this.logger.success(`${result.success.length} attachments uploadés`);
    }

    if (result.failed.length > 0) {
      this.logger.warn(`${result.failed.length} attachments en échec`);
    }
  }

  /**
   * Affiche un résumé à la console
   */
  printsToStdio(): boolean {
    return true;
  }
}

export default XrayAdvancedReporter;
