import { test, expect } from '@playwright/test';

test.describe('Widget Console Logs', () => {
  test('capture widget initialization logs', async ({ page }) => {
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
      return typeof (window as any).WiggumChatWidget !== 'undefined';
    });
    console.log('WiggumChatWidget API available:', hasWidgetAPI);
    
    // Try to manually init if not already done
    if (hasWidgetAPI) {
      const result = await page.evaluate(() => {
        const widget = (window as any).WiggumChatWidget;
        try {
          widget.init({ title: 'Test Widget' });
          return 'Initialized successfully';
        } catch (error) {
          return `Error: ${error}`;
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
    
    // Take a screenshot
    await page.screenshot({ path: 'widget-console-test.png', fullPage: true });
  });
});