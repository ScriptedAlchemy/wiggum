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
    
    // Capture all console logs
    page.on('console', msg => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });
    
    // Navigate to the page
    await page.goto('/');
    
    // Wait a bit for any async initialization
    await page.waitForTimeout(2000);
    
    // Print all console logs
    console.log('=== Console Logs ===');
    consoleLogs.forEach(log => console.log(log));
    console.log('===================');
    
    // Check if widget initialization was attempted
    const initLogs = consoleLogs.filter(log => log.includes('Wiggum') || log.includes('WIGGUM'));
    console.log('Widget-related logs:', initLogs);
    
    // Check if WiggumChatWidget is defined on window
    const hasWidgetAPI = await page.evaluate(() => {
      return typeof window.WiggumChatWidget !== 'undefined';
    });
    console.log('WiggumChatWidget API available:', hasWidgetAPI);
    
    // Try to manually init if not already done
    if (hasWidgetAPI) {
      const result = await page.evaluate(() => {
        const widget = window.WiggumChatWidget;
        if (!widget) {
          return 'Widget API unavailable';
        }
        try {
          widget.init({ title: 'Test Widget' });
          return 'Initialized successfully';
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : String(error)}`;
        }
      });
      console.log('Manual init result:', result);
    }
    
    // Wait and check for DOM elements
    await page.waitForTimeout(1000);
    
    const widgetRoot = await page.evaluate(() => {
      return document.getElementById('wiggum-chat-widget-root') !== null;
    });
    console.log('Widget root element exists:', widgetRoot);

    expect(hasWidgetAPI).toBe(true);
    expect(widgetRoot).toBe(true);
    
    // Take a screenshot
    await page.screenshot({ path: testInfo.outputPath('widget-console-test.png'), fullPage: true });
  });
});