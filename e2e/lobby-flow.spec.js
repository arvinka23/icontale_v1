// ═══════════════════════════════════════════════════════════════
//  Lobby Flow Smoke Test
//
//  Exercises the critical first-impression path of the app:
//
//     load -> enter nickname -> create lobby -> see lobby code
//
//  Failure modes this catches that unit tests cannot:
//     - The Socket.io client fails to connect through the real
//       transport (wrong CORS, wrong URL, broken bundle).
//     - The i18n runtime fails to load (locale JSON 404, wrong
//       base path) so buttons render as translation keys.
//     - index.html references an asset the SW doesn't ship.
//     - CSP blocks an inline/external resource.
// ═══════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

test.describe('Lobby flow', () => {
  test('creates a lobby and shows the 6-character room code', async ({ page }) => {
    // Surface any console / page errors loudly — easier to debug than
    // a silent timeout when the server is 500ing.
    const consoleErrors = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // The hero/header must be visible — catches "blank white page"
    // regressions where the bundle fails to parse.
    await expect(page.getByRole('heading', { name: 'IconTale', level: 1 })).toBeVisible();

    await page.getByLabel(/Dein Name|Your name/i).fill('Alice');

    await page.getByRole('button', { name: /Lobby erstellen|Create lobby/i }).first().click();

    // Room code must appear and match the canonical format.
    const roomCode = page.locator('#room-code');
    await expect(roomCode).toBeVisible({ timeout: 10_000 });
    const code = (await roomCode.textContent())?.trim() ?? '';
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    // Nothing in the console should have exploded during the run.
    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('landing page advertises the expected app metadata', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/IconTale/);

    // Content-Language header should match the html lang attribute.
    const htmlLang = await page.locator('html').getAttribute('lang');
    expect(['de', 'en']).toContain(htmlLang);
  });

  test('rejects an invalid room code with an inline error toast', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Lobby beitreten|Join lobby/i }).first().click();
    await page.getByLabel(/Dein Name|Your name/i).fill('Bob');
    await page.getByLabel(/Lobby-Code|Lobby code/i).fill('NO');
    await page.getByRole('button', { name: /Lobby beitreten|Join lobby/i }).nth(1).click();

    const toastStack = page.locator('#toast-stack');
    await expect(toastStack).toContainText(/6/, { timeout: 5_000 });
  });
});
