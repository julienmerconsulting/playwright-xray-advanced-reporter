# playwright-xray-advanced-reporter

Reporter Playwright avancé pour **Xray Cloud** avec intégration complète JIRA.

Plus puissant que le plugin officiel `@xray-app/reporter-playwright` :
- ✅ Création automatique de Test Execution dans JIRA
- ✅ Import des résultats avec statuts détaillés  
- ✅ Liaison automatique au Test Plan via GraphQL
- ✅ Gestion des environnements de test Xray
- ✅ Upload automatique des screenshots, traces et vidéos
- ✅ Description enrichie avec métriques (pass rate, durée, etc.)
- ✅ Support des projets Playwright multi-navigateurs

## Installation

### Depuis npm (quand publié)
```bash
npm install playwright-xray-advanced-reporter
```

### Depuis GitHub
```bash
npm install github:USERNAME/playwright-xray-advanced-reporter
```

### Installation locale (recommandé pour tester)

**Option 1 : Depuis un dossier externe**
```bash
# Dézipper quelque part
unzip playwright-xray-advanced-reporter.zip -d C:\tools\playwright-xray-reporter

# Dans ton projet Playwright
cd mon-projet-playwright/
npm install C:\tools\playwright-xray-reporter
```

**Option 2 : Dans le projet (recommandé)**
```
mon-projet-playwright/
├── libs/
│   └── playwright-xray-advanced-reporter/   ← coller le dossier ici
├── tests/
├── playwright.config.ts
└── package.json
```

Puis :
```bash
npm install ./libs/playwright-xray-advanced-reporter
```

### Vérifier l'installation
```bash
# Lancer les tests du plugin
cd libs/playwright-xray-advanced-reporter
npm install
npx ts-node test-plugin.ts && npx ts-node test-integration.ts
```

## Configuration

### playwright.config.ts

```typescript
import { defineConfig } from '@playwright/test';
import type { XrayReporterConfig } from 'playwright-xray-advanced-reporter';

const xrayConfig: XrayReporterConfig = {
  // === JIRA Cloud ===
  jiraBaseUrl: 'https://votre-instance.atlassian.net',
  jiraEmail: 'votre.email@company.com',
  jiraApiToken: process.env.JIRA_API_TOKEN!,
  projectKey: 'PROJ',

  // === Xray Cloud ===
  xrayClientId: process.env.XRAY_CLIENT_ID!,
  xrayClientSecret: process.env.XRAY_CLIENT_SECRET!,

  // === Test Plan (optionnel) ===
  testPlanKey: 'PROJ-123',  // OU
  // testPlanSummary: 'Mon Test Plan Sprint 42',

  // === Options Test Execution ===
  testExecutionSummaryPrefix: 'Playwright Execution',
  testExecutionLabels: ['Automation', 'Playwright', 'Regression'],

  // === Environnements ===
  testEnvironments: ['Chrome', 'Windows'],

  // === Attachments ===
  uploadScreenshotsOnFailure: true,
  uploadTraces: true,
  uploadVideos: false,

  // === Mapping des tests ===
  testKeyPattern: /\[([A-Z]+-\d+)\]/,  // Pattern regex personnalisé
  // OU mapping explicite :
  // testKeyMapping: {
  //   'Mon test login': 'PROJ-456',
  //   'Mon test checkout': 'PROJ-789',
  // },

  // === Debug ===
  verbose: true,
};

export default defineConfig({
  reporter: [
    ['html'],
    ['playwright-xray-advanced-reporter', xrayConfig],
  ],
  
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
```

### Variables d'environnement

Créez un fichier `.env` (ne pas committer) :

```env
JIRA_API_TOKEN=votre_token_jira
XRAY_CLIENT_ID=votre_client_id_xray
XRAY_CLIENT_SECRET=votre_client_secret_xray
```

## Nommage des tests

Pour que le reporter associe vos tests aux Tests Xray, incluez la clé dans le titre :

```typescript
// ✅ Patterns supportés
test('[PROJ-123] Vérifier le login', async ({ page }) => { ... });
test('PROJ-123 - Vérifier le login', async ({ page }) => { ... });
test('Vérifier le login @PROJ-123', async ({ page }) => { ... });
test('Vérifier le login (PROJ-123)', async ({ page }) => { ... });

// ✅ Ou via describe
test.describe('[PROJ-100] Module Auth', () => {
  test('[PROJ-123] Login valide', async ({ page }) => { ... });
  test('[PROJ-124] Login invalide', async ({ page }) => { ... });
});
```

## Fonctionnalités détaillées

### Création automatique de Test Execution

À chaque exécution, le reporter :
1. Crée une nouvelle issue "Test Execution" dans JIRA
2. Ajoute les labels configurés
3. Génère une description avec un tableau de métriques :
   - Total tests / Passed / Failed / Skipped
   - Pass rate en pourcentage
   - Durée totale
   - Environnements utilisés

### Import des résultats vers Xray

Les résultats sont importés via l'API REST Xray :
- Statuts : PASSED, FAILED, SKIPPED, TODO
- Timestamps de début/fin
- Commentaires avec fichier, ligne, erreur

### Liaison au Test Plan

Si un Test Plan est configuré, le reporter :
1. Récupère l'issueId Xray via GraphQL
2. Associe la Test Execution au Test Plan
3. Les résultats apparaissent dans la vue Test Plan

### Environnements de test

Les environnements sont ajoutés automatiquement :
- Depuis la config `testEnvironments`
- Depuis les noms de projets Playwright (`chromium`, `firefox`, etc.)

### Upload des attachments

En cas d'échec, le reporter peut uploader :
- Screenshots (via JIRA API)
- Traces Playwright (`.zip`)
- Vidéos d'exécution

## API avancée

Vous pouvez utiliser les clients directement :

```typescript
import { JiraClient, XrayClient } from 'playwright-xray-advanced-reporter';

// Client JIRA
const jira = new JiraClient(baseUrl, email, apiToken);
await jira.searchIssuesByJql('project = PROJ AND type = Bug');
await jira.addAttachment('PROJ-123', './screenshot.png');

// Client Xray
const xray = new XrayClient(clientId, clientSecret);
await xray.authenticate();
const testPlanId = await xray.getTestPlanIssueId('PROJ-100');
await xray.addTestEnvironmentsToTestExecution(execId, ['Chrome', 'Linux']);
```

## Comparaison avec les autres plugins

| Fonctionnalité | @xray-app/junit-reporter | playwright-xray (inluxc) | Ce Plugin |
|----------------|--------------------------|--------------------------|-----------|
| Import résultats | ✅ (via XML) | ✅ | ✅ |
| Création Test Execution | ❌ Manuel | ✅ | ✅ |
| Liaison Test Plan | ❌ | ✅ | ✅ GraphQL |
| Environnements | ❌ | ✅ | ✅ Auto depuis projets PW |
| Upload attachments JIRA | ❌ | ❌ | ✅ |
| Description ADF enrichie | ❌ | ❌ | ✅ |
| Multi-projets en 1 run | ✅ | ❌ (1er seulement) | ✅ |
| Patterns extraction clé | Via annotations | 1 pattern | 4 patterns + custom + mapping |

## Troubleshooting

### "Test Execution type not found"

Vérifiez que Xray est bien installé sur votre projet JIRA et que le type "Test Execution" existe.

### "Authentication failed"

- JIRA : Créez un API token sur https://id.atlassian.com/manage-profile/security/api-tokens
- Xray : Créez des API Keys sur https://xray.cloud.getxray.app/settings/api-keys

### "Test key not found"

Assurez-vous que :
1. Le test existe dans Xray avec cette clé
2. Le pattern regex capture bien la clé
3. Activez `verbose: true` pour voir les clés détectées

## License

MIT - JMer Consulting
