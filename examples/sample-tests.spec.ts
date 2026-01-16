/**
 * Exemples de tests Playwright avec conventions de nommage pour Xray
 * 
 * Le reporter extrait automatiquement la clé Xray du titre du test
 * selon plusieurs patterns supportés.
 */
import { test, expect } from '@playwright/test';

// ============================================
// Pattern 1: [PROJ-XXX] au début du titre
// C'est le pattern recommandé, le plus lisible
// ============================================

test.describe('[PROJ-100] Module Authentification', () => {
  
  test('[PROJ-101] Login avec credentials valides', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'user@example.com');
    await page.fill('[data-testid="password"]', 'ValidPassword123');
    await page.click('[data-testid="submit"]');
    
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('[data-testid="welcome"]')).toBeVisible();
  });

  test('[PROJ-102] Login avec mot de passe incorrect', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'user@example.com');
    await page.fill('[data-testid="password"]', 'WrongPassword');
    await page.click('[data-testid="submit"]');
    
    await expect(page.locator('[data-testid="error"]')).toContainText('Invalid credentials');
    await expect(page).toHaveURL('/login');
  });

  test('[PROJ-103] Déconnexion utilisateur', async ({ page }) => {
    // Pré-condition : utilisateur connecté
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'user@example.com');
    await page.fill('[data-testid="password"]', 'ValidPassword123');
    await page.click('[data-testid="submit"]');
    
    // Action : déconnexion
    await page.click('[data-testid="logout"]');
    
    // Vérification
    await expect(page).toHaveURL('/login');
  });
});

// ============================================
// Pattern 2: PROJ-XXX - au début (avec tiret)
// ============================================

test('PROJ-201 - Création de compte utilisateur', async ({ page }) => {
  await page.goto('/signup');
  await page.fill('[data-testid="email"]', `test-${Date.now()}@example.com`);
  await page.fill('[data-testid="password"]', 'NewPassword123');
  await page.fill('[data-testid="confirm"]', 'NewPassword123');
  await page.click('[data-testid="submit"]');
  
  await expect(page.locator('[data-testid="success"]')).toBeVisible();
});

// ============================================
// Pattern 3: @PROJ-XXX n'importe où dans le titre
// Utile pour garder un titre descriptif en premier
// ============================================

test('Vérifier la page de profil @PROJ-301', async ({ page }) => {
  await page.goto('/profile');
  
  await expect(page.locator('h1')).toContainText('Mon Profil');
  await expect(page.locator('[data-testid="avatar"]')).toBeVisible();
});

// ============================================
// Pattern 4: (PROJ-XXX) à la fin du titre
// Style alternatif
// ============================================

test('Modification des préférences utilisateur (PROJ-401)', async ({ page }) => {
  await page.goto('/settings');
  
  await page.click('[data-testid="dark-mode"]');
  await page.click('[data-testid="save"]');
  
  await expect(page.locator('[data-testid="toast"]')).toContainText('Saved');
});

// ============================================
// Tests sans clé Xray (seront ignorés par le reporter)
// Utile pour des tests locaux ou en développement
// ============================================

test.describe('Tests en développement', () => {
  
  test.skip('Nouvelle fonctionnalité en cours', async ({ page }) => {
    // Ce test n'a pas de clé Xray, il ne sera pas reporté
    await page.goto('/new-feature');
  });

  test('Test exploratoire sans ticket', async ({ page }) => {
    // Pas de clé = pas de reporting Xray
    // Mais le test s'exécute quand même
    await page.goto('/');
    await expect(page).toHaveTitle(/Mon App/);
  });
});

// ============================================
// Tests paramétrés avec clé Xray
// ============================================

const testData = [
  { key: 'PROJ-501', email: 'admin@example.com', role: 'Admin' },
  { key: 'PROJ-502', email: 'user@example.com', role: 'User' },
  { key: 'PROJ-503', email: 'guest@example.com', role: 'Guest' },
];

for (const data of testData) {
  test(`[${data.key}] Vérifier accès pour rôle ${data.role}`, async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email"]', data.email);
    await page.fill('[data-testid="password"]', 'Password123');
    await page.click('[data-testid="submit"]');
    
    await expect(page.locator('[data-testid="role"]')).toContainText(data.role);
  });
}

// ============================================
// Test avec fixtures personnalisées
// ============================================

test.describe('[PROJ-600] Tests E2E Checkout', () => {
  
  test.beforeEach(async ({ page }) => {
    // Login avant chaque test
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'shopper@example.com');
    await page.fill('[data-testid="password"]', 'Password123');
    await page.click('[data-testid="submit"]');
  });

  test('[PROJ-601] Ajouter produit au panier', async ({ page }) => {
    await page.goto('/products');
    await page.click('[data-testid="product-1"] [data-testid="add-to-cart"]');
    
    await expect(page.locator('[data-testid="cart-count"]')).toHaveText('1');
  });

  test('[PROJ-602] Passer commande avec succès', async ({ page }) => {
    // Ajouter au panier
    await page.goto('/products');
    await page.click('[data-testid="product-1"] [data-testid="add-to-cart"]');
    
    // Checkout
    await page.goto('/checkout');
    await page.fill('[data-testid="card-number"]', '4242424242424242');
    await page.fill('[data-testid="expiry"]', '12/25');
    await page.fill('[data-testid="cvv"]', '123');
    await page.click('[data-testid="pay"]');
    
    await expect(page.locator('[data-testid="confirmation"]')).toBeVisible();
  });
});
