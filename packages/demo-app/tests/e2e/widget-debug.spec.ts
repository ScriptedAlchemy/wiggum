import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    __wiggum_widget_config?: Record<string, unknown>;
  }
}

test.describe('Widget Debug', () => {
  test('check widget configuration is loaded', async ({ page }, testInfo) => {
    // Navigate to the page
    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Check if the widget configuration is set (new loader key)
    const hasConfig = await page.evaluate(() => {
      return typeof window.__wiggum_widget_config !== 'undefined';
    });
    
    console.log('Has widget config:', hasConfig);
    
    // Get the config if it exists
    if (hasConfig) {
      const config = await page.evaluate(() => {
        return window.__wiggum_widget_config;
      });
      console.log('Widget config:', config);
    }
    
    // Check for any console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Console error:', msg.text());
      }
    });
    
    // Check if widget styles are loaded
    const hasWidgetStyles = await page.evaluate(() => {
      const styles = Array.from(document.querySelectorAll('style'));
      return styles.some(style => style.textContent?.includes('chat-widget'));
    });
    
    console.log('Has widget styles:', hasWidgetStyles);
    
    // Check DOM for widget elements
    const widgetElements = await page.evaluate(() => {
      return {
        chatWidget: document.querySelector('.chat-widget') !== null,
        toggleButton: document.querySelector('.chat-widget__toggle') !== null,
        window: document.querySelector('.chat-widget__window') !== null,
      };
    });
    
    console.log('Widget elements found:', widgetElements);
    
    // Take a screenshot for debugging
    await page.screenshot({ path: testInfo.outputPath('widget-debug.png'), fullPage: true });
    
    expect(hasConfig).toBe(true);
    expect(hasWidgetStyles).toBe(true);
    expect(widgetElements.chatWidget).toBe(true);
    expect(widgetElements.toggleButton).toBe(true);
  });
});
