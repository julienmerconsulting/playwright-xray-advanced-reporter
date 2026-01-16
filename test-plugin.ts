/**
 * Test de validation du plugin - vérifie que tout compile et s'instancie correctement
 */

import {
  XrayAdvancedReporter,
  JiraClient,
  XrayClient,
  extractTestKeyFromTitle,
  mapPlaywrightStatusToXray,
  formatDateISO,
  formatDuration,
  createAdfText,
  createTestExecutionDescription,
  generateTestExecutionSummary,
  Logger,
} from './src/index';

console.log('🧪 Test du plugin playwright-xray-advanced-reporter\n');

// ============================================
// Test 1: Extraction des clés Xray
// ============================================
console.log('📋 Test 1: Extraction des clés Xray depuis les titres');

const testCases = [
  { title: '[PROJ-123] Mon test', expected: 'PROJ-123' },
  { title: 'PROJ-456 - Mon test', expected: 'PROJ-456' },
  { title: 'Mon test @PROJ-789', expected: 'PROJ-789' },
  { title: 'Mon test (PROJ-101)', expected: 'PROJ-101' },
  { title: '[ABC2-999] Test complexe', expected: 'ABC2-999' },
  { title: 'Test sans clé', expected: null },
  { title: '', expected: null },
];

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const result = extractTestKeyFromTitle(tc.title);
  if (result === tc.expected) {
    console.log(`  ✅ "${tc.title}" → ${result}`);
    passed++;
  } else {
    console.log(`  ❌ "${tc.title}" → ${result} (attendu: ${tc.expected})`);
    failed++;
  }
}

// ============================================
// Test 2: Mapping des statuts
// ============================================
console.log('\n📋 Test 2: Mapping des statuts Playwright → Xray');

const statusTests: Array<{ pw: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted'; xray: string }> = [
  { pw: 'passed', xray: 'PASSED' },
  { pw: 'failed', xray: 'FAILED' },
  { pw: 'skipped', xray: 'SKIPPED' },
  { pw: 'timedOut', xray: 'FAILED' },
  { pw: 'interrupted', xray: 'FAILED' },
];

for (const st of statusTests) {
  const result = mapPlaywrightStatusToXray(st.pw);
  if (result === st.xray) {
    console.log(`  ✅ ${st.pw} → ${result}`);
    passed++;
  } else {
    console.log(`  ❌ ${st.pw} → ${result} (attendu: ${st.xray})`);
    failed++;
  }
}

// ============================================
// Test 3: Formatage des dates
// ============================================
console.log('\n📋 Test 3: Formatage des dates ISO');

const testDate = new Date('2024-01-15T10:30:00Z');
const formattedDate = formatDateISO(testDate);
if (formattedDate.includes('2024-01-15') && formattedDate.includes('10:30:00')) {
  console.log(`  ✅ Date formatée: ${formattedDate}`);
  passed++;
} else {
  console.log(`  ❌ Date mal formatée: ${formattedDate}`);
  failed++;
}

// ============================================
// Test 4: Formatage des durées
// ============================================
console.log('\n📋 Test 4: Formatage des durées');

const durationTests = [
  { ms: 500, expected: '500ms' },
  { ms: 1500, expected: '1.5s' },
  { ms: 65000, expected: '1m 5s' },
];

for (const dt of durationTests) {
  const result = formatDuration(dt.ms);
  if (result === dt.expected) {
    console.log(`  ✅ ${dt.ms}ms → ${result}`);
    passed++;
  } else {
    console.log(`  ❌ ${dt.ms}ms → ${result} (attendu: ${dt.expected})`);
    failed++;
  }
}

// ============================================
// Test 5: Création document ADF
// ============================================
console.log('\n📋 Test 5: Création document ADF');

const adfDoc = createAdfText('Test content');
if (adfDoc.type === 'doc' && adfDoc.version === 1 && adfDoc.content.length > 0) {
  console.log(`  ✅ Document ADF créé correctement`);
  passed++;
} else {
  console.log(`  ❌ Document ADF invalide`);
  failed++;
}

// ============================================
// Test 6: Description Test Execution
// ============================================
console.log('\n📋 Test 6: Génération description Test Execution');

const description = createTestExecutionDescription(
  10, 8, 1, 1, 60000, ['Chrome', 'Windows'], new Date(), '1.40.0'
);

if (description.type === 'doc' && description.content.length > 0) {
  console.log(`  ✅ Description générée avec ${description.content.length} éléments`);
  passed++;
} else {
  console.log(`  ❌ Description invalide`);
  failed++;
}

// ============================================
// Test 7: Summary Test Execution
// ============================================
console.log('\n📋 Test 7: Génération summary Test Execution');

const summary = generateTestExecutionSummary('Playwright Auto', 'PROJ', new Date());
if (summary.includes('Playwright Auto') && summary.includes('PROJ')) {
  console.log(`  ✅ Summary: ${summary}`);
  passed++;
} else {
  console.log(`  ❌ Summary invalide: ${summary}`);
  failed++;
}

// ============================================
// Test 8: Instanciation des clients
// ============================================
console.log('\n📋 Test 8: Instanciation des clients');

try {
  const jiraClient = new JiraClient(
    'https://test.atlassian.net',
    'test@example.com',
    'fake-token'
  );
  console.log(`  ✅ JiraClient instancié`);
  passed++;
} catch (e) {
  console.log(`  ❌ JiraClient erreur: ${e}`);
  failed++;
}

try {
  const xrayClient = new XrayClient('fake-client-id', 'fake-secret');
  console.log(`  ✅ XrayClient instancié`);
  passed++;
} catch (e) {
  console.log(`  ❌ XrayClient erreur: ${e}`);
  failed++;
}

// ============================================
// Test 9: Instanciation du Reporter
// ============================================
console.log('\n📋 Test 9: Instanciation du Reporter');

try {
  const reporter = new XrayAdvancedReporter({
    jiraBaseUrl: 'https://test.atlassian.net',
    jiraEmail: 'test@example.com',
    jiraApiToken: 'fake-token',
    projectKey: 'PROJ',
    xrayClientId: 'fake-client-id',
    xrayClientSecret: 'fake-secret',
    testPlanKey: 'PROJ-100',
    verbose: false,
  });
  console.log(`  ✅ XrayAdvancedReporter instancié`);
  passed++;
} catch (e) {
  console.log(`  ❌ XrayAdvancedReporter erreur: ${e}`);
  failed++;
}

// ============================================
// Test 10: Logger
// ============================================
console.log('\n📋 Test 10: Logger');

try {
  const logger = new Logger('[Test]', true);
  logger.info('Test info');
  logger.success('Test success');
  logger.debug('Test debug');
  console.log(`  ✅ Logger fonctionne`);
  passed++;
} catch (e) {
  console.log(`  ❌ Logger erreur: ${e}`);
  failed++;
}

// ============================================
// Résumé
// ============================================
console.log('\n' + '='.repeat(50));
console.log(`📊 RÉSULTATS: ${passed} passés, ${failed} échoués`);
console.log('='.repeat(50));

if (failed === 0) {
  console.log('\n✅ TOUS LES TESTS PASSENT - Le plugin est fonctionnel !\n');
  process.exit(0);
} else {
  console.log('\n❌ CERTAINS TESTS ONT ÉCHOUÉ\n');
  process.exit(1);
}
