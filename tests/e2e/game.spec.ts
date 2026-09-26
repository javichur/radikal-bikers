import { expect, test, type Page } from '@playwright/test';

const screen = (page: Page) => page.locator('#app');

const speed = async (page: Page): Promise<number> => Number(await page.getByTestId('hud-speed').textContent());

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard flow');

  test('title → select rider → select stage → race with keyboard', async ({ page }) => {
    await page.goto('./?e2e&quality=low');
    await expect(page.locator('.logo')).toBeVisible();
    await expect(screen(page)).toHaveAttribute('data-screen', 'title');

    await page.keyboard.press('Enter');
    await expect(screen(page)).toHaveAttribute('data-screen', 'characterSelect');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.card.selected')).toHaveAttribute('data-character', 'luna');

    await page.keyboard.press('Enter');
    await expect(screen(page)).toHaveAttribute('data-screen', 'stageSelect');
    await expect(page.locator('[data-stage=harbor]')).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page.getByTestId('hud')).toBeVisible();
    await expect(screen(page)).toHaveAttribute('data-screen', 'racing', { timeout: 30_000 });

    await page.keyboard.down('ArrowUp');
    await expect.poll(() => speed(page), { timeout: 30_000 }).toBeGreaterThan(5);
    await page.keyboard.up('ArrowUp');
    await expect(page.getByTestId('hud-time')).not.toBeEmpty();
    await expect(page.locator('.touch-controls')).toBeHidden();
  });

  test('pause menu and quit to title', async ({ page }) => {
    await page.goto('./?e2e&quality=low');
    for (let i = 0; i < 3; i++) await page.keyboard.press('Enter');
    await expect(screen(page)).toHaveAttribute('data-screen', 'countdown');
    await page.keyboard.press('Escape');
    await expect(screen(page)).toHaveAttribute('data-screen', 'paused');
    await page.getByRole('button', { name: /quit|salir/i }).click();
    await expect(screen(page)).toHaveAttribute('data-screen', 'title');
  });

  test('locked content, instant restart and results', async ({ page }) => {
    await page.goto('./?e2e&quality=low');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-character=nitro]')).toHaveClass(/locked/);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-stage=harborNight]')).toHaveClass(/locked/);
    await expect(page.locator('[data-stage=harbor] .challenges li')).toHaveCount(3);
    await page.keyboard.press('Enter');
    await expect(screen(page)).toHaveAttribute('data-screen', 'racing', { timeout: 30_000 });

    await page.keyboard.press('KeyR');
    await expect(screen(page)).toHaveAttribute('data-screen', 'countdown');
    await expect(screen(page)).toHaveAttribute('data-screen', 'racing', { timeout: 30_000 });

    // Run out of time without continuing to reach the results screen.
    await page.evaluate(() => {
      const rr = (window as unknown as { __RR__: { game: { world: { race: { timeLeft: number } } } } }).__RR__;
      rr.game.world.race.timeLeft = 0.01;
    });
    await expect(screen(page)).toHaveAttribute('data-screen', 'continue');
    await page.keyboard.press('Escape');
    await expect(screen(page)).toHaveAttribute('data-screen', 'gameOver', { timeout: 20_000 });
    await expect(page.locator('.result .xp')).toBeVisible();
    await page.getByRole('button', { name: /again|otra/i }).click();
    await expect(screen(page)).toHaveAttribute('data-screen', 'countdown');
  });

  test('language toggle is persisted', async ({ page }) => {
    await page.goto('./');
    const toggle = page.getByRole('button', { name: /language|idioma/i });
    const before = await toggle.textContent();
    await toggle.click();
    await expect(toggle).not.toHaveText(before ?? '');
    const lang = await page.evaluate(() => document.documentElement.lang);
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe(lang);
    const expected = lang === 'es' ? /Elige|Pulsa/ : /Press|Choose/;
    await expect(page.locator('.press')).toHaveText(expected);
  });
});

test.describe('touch (iPhone)', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch flow');

  test('tap through menus and ride with on-screen controls', async ({ page }) => {
    await page.goto('./?e2e&quality=low');
    await page.locator('.title-screen').tap();
    await expect(screen(page)).toHaveAttribute('data-screen', 'characterSelect');
    // First tap selects, second tap confirms.
    await page.locator('[data-character=rocco]').tap();
    await expect(screen(page)).toHaveAttribute('data-screen', 'stageSelect');
    await page.locator('[data-stage=harbor]').tap();

    await expect(page.locator('.touch-controls')).toBeVisible();
    await expect(page.locator('.hud-pause')).toBeVisible();
    await expect(screen(page)).toHaveAttribute('data-screen', 'racing', { timeout: 30_000 });

    const gas = page.locator('[data-btn=gas]');
    await gas.dispatchEvent('pointerdown', { pointerId: 11, isPrimary: true });
    await expect.poll(() => speed(page), { timeout: 30_000 }).toBeGreaterThan(5);
    await gas.dispatchEvent('pointerup', { pointerId: 11 });

    await page.locator('.hud-pause').tap();
    await expect(screen(page)).toHaveAttribute('data-screen', 'paused');
  });
});
