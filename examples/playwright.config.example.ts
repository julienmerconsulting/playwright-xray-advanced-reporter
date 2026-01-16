/**
 * Exemple de configuration Playwright avec le reporter Xray Advanced
 * 
 * Copier ce fichier et adapter les valeurs à votre projet
 */
import { defineConfig, devices } from '@playwright/test';
import type { XrayReporterConfig } from 'playwright-xray-advanced-reporter';

// Configuration du reporter Xray
const xrayReporterConfig: XrayReporterConfig = {
  // ============================================
  // JIRA Cloud - Configuration obligatoire
  // ============================================
  
  /** URL de votre instance JIRA Cloud */
  jiraBaseUrl: process.env.JIRA_BASE_URL || 'https://votre-instance.atlassian.net',
  
  /** Email du compte JIRA (celui utilisé pour créer l'API token) */
  jiraEmail: process.env.JIRA_EMAIL || 'votre.email@company.com',
  
  /** API Token JIRA - À créer sur https://id.atlassian.com/manage-profile/security/api-tokens */
  jiraApiToken: process.env.JIRA_API_TOKEN || '',
  
  /** Clé du projet JIRA (préfixe des issues, ex: PROJ pour PROJ-123) */
  projectKey: process.env.JIRA_PROJECT_KEY || 'PROJ',

  // ============================================
  // Xray Cloud - Configuration obligatoire
  // ============================================
  
  /** Client ID Xray - À créer sur https://xray.cloud.getxray.app/settings/api-keys */
  xrayClientId: process.env.XRAY_CLIENT_ID || '',
  
  /** Client Secret Xray */
  xrayClientSecret: process.env.XRAY_CLIENT_SECRET || '',

  // ============================================
  // Test Plan - Configuration optionnelle
  // ============================================
  
  /** 
   * Clé du Test Plan existant pour lier les exécutions
   * Si non fourni, les exécutions seront créées sans liaison
   */
  testPlanKey: process.env.XRAY_TEST_PLAN_KEY || undefined,
  
  /**
   * Alternative : recherche du Test Plan par son summary
   * Utile si la clé change entre environnements
   */
  // testPlanSummary: 'Sprint 42 - Tests Regression',

  // ============================================
  // Test Execution - Personnalisation
  // ============================================
  
  /** Préfixe du summary de la Test Execution créée */
  testExecutionSummaryPrefix: 'Playwright Auto',
  
  /** Labels ajoutés à la Test Execution */
  testExecutionLabels: ['Automation', 'Playwright', 'CI'],

  // ============================================
  // Environnements de test
  // ============================================
  
  /** 
   * Environnements Xray à associer
   * Les noms de projets Playwright (chromium, firefox...) sont ajoutés automatiquement
   */
  testEnvironments: [
    process.env.TEST_ENV || 'Staging',
    process.platform === 'win32' ? 'Windows' : 
      process.platform === 'darwin' ? 'MacOS' : 'Linux',
  ],

  // ============================================
  // Attachments - Screenshots, Traces, Vidéos
  // ============================================
  
  /** Upload les screenshots en cas d'échec du test */
  uploadScreenshotsOnFailure: true,
  
  /** Upload les traces Playwright (.zip) */
  uploadTraces: true,
  
  /** Upload les vidéos d'exécution */
  uploadVideos: false,

  // ============================================
  // Mapping des tests vers Xray
  // ============================================
  
  /**
   * Pattern regex pour extraire la clé Xray du titre du test
   * Groupe de capture 1 = la clé
   * 
   * Patterns supportés par défaut :
   * - [PROJ-123] Mon test
   * - PROJ-123 - Mon test
   * - Mon test @PROJ-123
   * - Mon test (PROJ-123)
   */
  testKeyPattern: /\[([A-Z][A-Z0-9]*-\d+)\]/,
  
  /**
   * Alternative : mapping explicite titre → clé Xray
   * Prioritaire sur le pattern regex
   */
  // testKeyMapping: {
  //   'Login avec credentials valides': 'PROJ-101',
  //   'Login avec mot de passe incorrect': 'PROJ-102',
  //   'Déconnexion utilisateur': 'PROJ-103',
  // },

  // ============================================
  // Debug
  // ============================================
  
  /** Activer les logs détaillés */
  verbose: process.env.DEBUG === 'true',
};

export default defineConfig({
  // ============================================
  // Configuration Playwright
  // ============================================
  
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  
  // ============================================
  // Reporters
  // ============================================
  
  reporter: [
    // Reporter HTML pour visualisation locale
    ['html', { open: 'never' }],
    
    // Reporter Xray Advanced
    ['playwright-xray-advanced-reporter', xrayReporterConfig],
    
    // Reporter console pour CI
    ['list'],
  ],

  // ============================================
  // Configuration commune
  // ============================================
  
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    
    // Traces et screenshots pour le debug
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    // Timeouts
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  // ============================================
  // Projets (Navigateurs)
  // ============================================
  
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    
    // Tests mobile
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // ============================================
  // Serveur de développement (optionnel)
  // ============================================
  
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
