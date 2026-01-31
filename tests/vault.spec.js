import { test, expect } from '@playwright/test';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { randomBytes, webcrypto } from 'crypto';

// Path to your HTML file
const originalHtmlPath = path.resolve(__dirname, '..', 'vault.html');
let baseHtmlContent = '';

test.beforeAll(async () => {
  baseHtmlContent = await fs.readFile(originalHtmlPath, 'utf-8');
});

let tempVaultPath = null;

test.beforeEach(async ({ page }) => {
  // Simulates a browser environment without File System Access API to force download behavior
  await page.addInitScript(() => {
    delete window.showSaveFilePicker;
    delete window.showOpenFilePicker;
  });
});

test.afterEach(async () => {
  if (tempVaultPath) {
    await fs.unlink(tempVaultPath).catch(() => {}); 
    tempVaultPath = null;
  }
});

// Helper: Injects encrypted data into the <script> tag of the HTML
const createPopulatedVaultFile = async (encryptedData) => {
  const modifiedHtml = baseHtmlContent.replace(
    '<script id="vault-data" type="text/encrypted-json"></script>',
    `<script id="vault-data" type="text/encrypted-json">${encryptedData}</script>`
  );

  const tempDir = os.tmpdir();
  const uniqueName = `vault-test-${randomBytes(8).toString('hex')}.html`;
  tempVaultPath = path.join(tempDir, uniqueName);
  
  await fs.writeFile(tempVaultPath, modifiedHtml);
  return `file://${tempVaultPath}`;
};

// Helper: Replicates the Encryption logic from the source HTML
const createEncryptedPayload = async ({ content, vaultId, password }) => {
  const ITERATIONS = 200_000;
  
  const toBase64 = buffer => Buffer.from(buffer).toString('base64');
  
  const deriveKey = async (password, salt) => {
    const baseKey = await webcrypto.subtle.importKey(
        'raw', 
        new TextEncoder().encode(password), 
        'PBKDF2', 
        false, 
        ['deriveKey']
    );
    return webcrypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, 
        baseKey, 
        { name: 'AES-GCM', length: 256 }, 
        false, 
        ['encrypt']
    );
  };

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt);
  
  // The app wraps content and vaultId in a JSON object before encrypting
  const payloadObject = { content, vaultId };
  const plaintext = JSON.stringify(payloadObject);
  
  const encrypted = await webcrypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, 
      key, 
      new TextEncoder().encode(plaintext)
  );
  
  return JSON.stringify({
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(encrypted)
  });
};

test.describe('Pristine Vault (New File)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`file://${originalHtmlPath}`);
  });

  test('should display main view and be ready for input', async ({ page }) => {
    await expect(page.locator('#main-view')).toBeVisible();
    await expect(page.locator('#login-view')).toBeHidden();
    await expect(page.locator('#notepad')).toBeEmpty();
    await expect(page.locator('#notepad')).toBeFocused();
    await expect(page.locator('#unsaved-indicator')).toBeHidden();
  });

  test('should show and hide unsaved indicator based on content changes', async ({ page }) => {
    await expect(page.locator('#unsaved-indicator')).toBeHidden();
    
    await page.locator('#notepad').fill('some new text');
    await expect(page.locator('#unsaved-indicator')).toBeVisible();
    
    await page.locator('#notepad').fill('');
    await expect(page.locator('#unsaved-indicator')).toBeHidden();
  });
  
  test('should require a password on first save and handle validation', async ({ page }) => {
    await page.locator('#notepad').fill('some content');
    await page.locator('#save-btn').click();
    
    const modal = page.locator('#password-modal');
    await expect(modal).toBeVisible();
    
    // Test empty password
    await modal.locator('button[value="confirm"]').click();
    await expect(page.locator('#password-error')).toHaveText('Password cannot be empty.');

    // Test mismatch
    await page.locator('#password-input').fill('password123');
    await page.locator('#password-confirm').fill('password456');
    await modal.locator('button[value="confirm"]').click();
    await expect(page.locator('#password-error')).toHaveText('Passwords do not match.');

    // Test cancel
    await modal.locator('button[value="cancel"]').click();
    await expect(modal).toBeHidden();
  });

  test('should create and download a new vault file that can be unlocked', async ({ page, context }) => {
    const initialContent = 'This is my new secret note.';
    const newPassword = 'supersecret123';

    await page.locator('#notepad').fill(initialContent);
    await page.locator('#save-btn').click();
    
    await expect(page.locator('#password-modal')).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    
    await page.locator('#password-input').fill(newPassword);
    await page.locator('#password-confirm').fill(newPassword);
    await page.locator('#password-modal button[value="confirm"]').click();

    const download = await downloadPromise;
    const downloadedFilePath = path.join(os.tmpdir(), download.suggestedFilename());
    await download.saveAs(downloadedFilePath);
    
    try {
      const newPage = await context.newPage();
      await newPage.goto(`file://${downloadedFilePath}`);
      
      await expect(newPage.locator('#login-view')).toBeVisible();
      await newPage.locator('#master-password').fill(newPassword);
      await newPage.locator('#login-form button[type="submit"]').click();
      
      await expect(newPage.locator('#main-view')).toBeVisible();
      await expect(newPage.locator('#notepad')).toHaveValue(initialContent);
      await expect(newPage.locator('#unsaved-indicator')).toBeHidden();
      await newPage.close();
    } finally {
      await fs.unlink(downloadedFilePath).catch(() => {});
    }
  });

  test('should lock a pristine vault and reload to a clean state', async ({ page }) => {
      await page.locator('#notepad').fill('this text will disappear');
      await page.locator('#lock-btn').click();
      
      await page.waitForLoadState('domcontentloaded');
      // A locked pristine vault reloads to a new empty vault
      await expect(page.locator('#main-view')).toBeVisible();
      await expect(page.locator('#notepad')).toBeEmpty();
  });
});

test.describe('Existing Vault (Populated File)', () => {
  const vaultId = 'test-vault-123';
  const password = 'my-secure-password';
  const content = 'This is some secret existing content.';

  test.beforeEach(async ({ page }) => {
    const encryptedPayload = await createEncryptedPayload({ content, vaultId, password });
    const fileUrl = await createPopulatedVaultFile(encryptedPayload);
    await page.goto(fileUrl);
  });

  test('should display the login view on load', async ({ page }) => {
    await expect(page.locator('#login-view')).toBeVisible();
    await expect(page.locator('#main-view')).toBeHidden();
    await expect(page.locator('#master-password')).toBeFocused();
  });

  test('should show an error for an incorrect password', async ({ page }) => {
    await page.locator('#master-password').fill('wrong-password');
    await page.locator('#login-form button[type="submit"]').click();
    
    await expect(page.locator('#error-message')).toHaveText('Invalid password');
    await expect(page.locator('#login-view')).toBeVisible();
  });

  test('should unlock successfully and display content with the correct password', async ({ page }) => {
    await page.locator('#master-password').fill(password);
    await page.locator('#login-form button[type="submit"]').click();
    
    await expect(page.locator('#main-view')).toBeVisible();
    await expect(page.locator('#login-view')).toBeHidden();
    await expect(page.locator('#notepad')).toHaveValue(content);
    await expect(page.locator('#unsaved-indicator')).toBeHidden();
  });

  test('should allow content modification and save the updated file', async ({ page, context }) => {
    await page.locator('#master-password').fill(password);
    await page.locator('#login-form button[type="submit"]').click();
    await expect(page.locator('#main-view')).toBeVisible();

    const newContent = content + '\nAnd some new additions.';
    await page.locator('#notepad').fill(newContent);
    await expect(page.locator('#unsaved-indicator')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#save-btn').click();
    const download = await downloadPromise;
    const downloadedFilePath = path.join(os.tmpdir(), `updated-${download.suggestedFilename()}`);
    await download.saveAs(downloadedFilePath);

    await expect(page.locator('#unsaved-indicator')).toBeHidden();
    
    try {
        const newPage = await context.newPage();
        await newPage.goto(`file://${downloadedFilePath}`);
        await newPage.locator('#master-password').fill(password);
        await newPage.locator('#login-form button[type="submit"]').click();
        await expect(newPage.locator('#notepad')).toHaveValue(newContent);
        await newPage.close();
    } finally {
        await fs.unlink(downloadedFilePath).catch(() => {});
    }
  });

  test('should allow changing the master password', async ({ page, context }) => {
    const newPassword = 'new-stronger-password-456';

    await page.locator('#master-password').fill(password);
    await page.locator('#login-form button[type="submit"]').click();
    await expect(page.locator('#main-view')).toBeVisible();

    await page.locator('#password-btn').click();
    const modal = page.locator('#password-modal');
    await expect(modal).toBeVisible();
    
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#password-input').fill(newPassword);
    await page.locator('#password-confirm').fill(newPassword);
    await modal.locator('button[value="confirm"]').click();

    const download = await downloadPromise;
    const downloadedFilePath = path.join(os.tmpdir(), `rekeyed-${download.suggestedFilename()}`);
    await download.saveAs(downloadedFilePath);
    
    await expect(page.locator('#unsaved-indicator')).toBeHidden();

    try {
        const newPage = await context.newPage();
        await newPage.goto(`file://${downloadedFilePath}`);
        
        // Verify old password fails
        await newPage.locator('#master-password').fill(password);
        await newPage.locator('#login-form button[type="submit"]').click();
        await expect(newPage.locator('#error-message')).toHaveText('Invalid password');

        // Verify new password works
        await newPage.locator('#master-password').fill(newPassword);
        await newPage.locator('#login-form button[type="submit"]').click();
        await expect(newPage.locator('#main-view')).toBeVisible();
        await expect(newPage.locator('#notepad')).toHaveValue(content);
        await newPage.close();
    } finally {
        await fs.unlink(downloadedFilePath).catch(() => {});
    }
  });

   test('should lock the vault and return to the login screen', async ({ page }) => {
      await page.locator('#master-password').fill(password);
      await page.locator('#login-form button[type="submit"]').click();
      await expect(page.locator('#main-view')).toBeVisible();

      await page.locator('#lock-btn').click();

      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('#login-view')).toBeVisible();
      await expect(page.locator('#main-view')).toBeHidden();
   });
});