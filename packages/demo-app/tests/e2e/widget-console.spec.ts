import { test, expect } from '@playwright/test';

type WidgetApi = {
  init: (config?: { title?: string }) => void;
};

declare global {
  interface Window {
    WiggumChatWidget?: WidgetApi;
  }
}

test.describe('Widget Console Logs', () => {
  test('capture widget initialization logs', async ({ page }, testInfo) => {
    const consoleLogs: string[] = [];

    page.on('console', msg => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    await page.goto('/');
    await page.waitForFunction(() => typeof window.WiggumChatWidget !== 'undefined');

    const hasWidgetAPI = await page.evaluate(() => {
      return typeof window.WiggumChatWidget !== 'undefined';
    });

    if (hasWidgetAPI) {
      await page.evaluate(() => {
        const widget = window.WiggumChatWidget;
        if (!widget) {
          return;
        }
        widget.init({ title: 'Test Widget' });
      });
    }

    await page.waitForSelector('#wiggum-chat-widget-root');

    const widgetRoot = await page.evaluate(() => {
      return document.getElementById('wiggum-chat-widget-root') !== null;
    });
    const consoleErrors = consoleLogs.filter((log) => log.startsWith('[error]'));

    expect(hasWidgetAPI).toBe(true);
    expect(widgetRoot).toBe(true);
    expect(consoleErrors).toEqual([]);

    await page.screenshot({ path: testInfo.outputPath('widget-console-test.png'), fullPage: true });
  });
});