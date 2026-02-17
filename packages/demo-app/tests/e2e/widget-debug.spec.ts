import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    __wiggum_widget_config?: Record<string, unknown>;
  }
}

test.describe('Widget Debug', () => {
  test('check widget configuration is loaded', async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hasConfig = await page.evaluate(() => {
      return typeof window.__wiggum_widget_config !== 'undefined';
    });

    if (hasConfig) {
      await page.evaluate(() => {
        return window.__wiggum_widget_config;
      });
    }

    const hasWidgetStyles = await page.evaluate(() => {
      const styles = Array.from(document.querySelectorAll('style'));
      return styles.some(style => style.textContent?.includes('chat-widget'));
    });

    const widgetElements = await page.evaluate(() => {
      return {
        chatWidget: document.querySelector('.chat-widget') !== null,
        toggleButton: document.querySelector('.chat-widget__toggle') !== null,
        window: document.querySelector('.chat-widget__window') !== null,
      };
    });

    await page.screenshot({ path: testInfo.outputPath('widget-debug.png'), fullPage: true });

    expect(hasConfig).toBe(true);
    expect(hasWidgetStyles).toBe(true);
    expect(widgetElements.chatWidget).toBe(true);
    expect(widgetElements.toggleButton).toBe(true);
    expect(consoleErrors).toEqual([]);
  });
});
