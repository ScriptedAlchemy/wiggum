import { test, expect } from '@playwright/test';

type WidgetApi = {
  init: () => void;
  destroy: () => void;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
};

declare global {
  interface Window {
    WiggumChatWidget?: WidgetApi;
    __wiggum_widget_config?: {
      disableBackend?: boolean;
    };
  }
}

test.describe('Widget manager browser API', () => {
  test('open/close/isOpen reflect runtime state', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#wiggum-chat-widget-root');

    const hasWidgetApi = await page.evaluate(() => typeof window.WiggumChatWidget !== 'undefined');
    expect(hasWidgetApi).toBe(true);
    const disableBackendFlag = await page.evaluate(
      () => window.__wiggum_widget_config?.disableBackend ?? false,
    );
    expect(disableBackendFlag).toBe(true);

    const initialState = await page.evaluate(() => window.WiggumChatWidget?.isOpen() ?? null);
    expect(initialState).toBe(false);

    await page.evaluate(() => {
      window.WiggumChatWidget?.open();
    });
    await page.waitForFunction(() => window.WiggumChatWidget?.isOpen() === true);

    const afterOpen = await page.evaluate(() => ({
      isOpen: window.WiggumChatWidget?.isOpen() ?? null,
      hasWindow: document.querySelector('.chat-widget__window') !== null,
    }));
    expect(afterOpen.isOpen).toBe(true);
    expect(afterOpen.hasWindow).toBe(true);

    await page.evaluate(() => {
      window.WiggumChatWidget?.close();
    });
    await page.waitForFunction(() => window.WiggumChatWidget?.isOpen() === false);

    const afterClose = await page.evaluate(() => ({
      isOpen: window.WiggumChatWidget?.isOpen() ?? null,
      hasWindow: document.querySelector('.chat-widget__window') !== null,
    }));
    expect(afterClose.isOpen).toBe(false);
    expect(afterClose.hasWindow).toBe(false);
  });

  test('open auto-initializes widget after destroy', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#wiggum-chat-widget-root');

    await page.evaluate(() => {
      window.WiggumChatWidget?.destroy();
    });
    await page.waitForFunction(() => document.getElementById('wiggum-chat-widget-root') === null);

    const afterDestroy = await page.evaluate(() => ({
      hasRoot: document.getElementById('wiggum-chat-widget-root') !== null,
      isOpen: window.WiggumChatWidget?.isOpen() ?? null,
    }));
    expect(afterDestroy.hasRoot).toBe(false);
    expect(afterDestroy.isOpen).toBe(false);

    await page.evaluate(() => {
      window.WiggumChatWidget?.close();
    });
    const afterCloseWithoutInit = await page.evaluate(() => ({
      hasRoot: document.getElementById('wiggum-chat-widget-root') !== null,
      isOpen: window.WiggumChatWidget?.isOpen() ?? null,
    }));
    expect(afterCloseWithoutInit.hasRoot).toBe(false);
    expect(afterCloseWithoutInit.isOpen).toBe(false);

    await page.evaluate(() => {
      window.WiggumChatWidget?.open();
    });
    await page.waitForFunction(() => document.getElementById('wiggum-chat-widget-root') !== null);
    await page.waitForFunction(() => window.WiggumChatWidget?.isOpen() === true);

    const afterReopen = await page.evaluate(() => ({
      hasRoot: document.getElementById('wiggum-chat-widget-root') !== null,
      isOpen: window.WiggumChatWidget?.isOpen() ?? null,
      hasWindow: document.querySelector('.chat-widget__window') !== null,
    }));
    expect(afterReopen.hasRoot).toBe(true);
    expect(afterReopen.isOpen).toBe(true);
    expect(afterReopen.hasWindow).toBe(true);
  });

  test('sending a message works in backend-disabled mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#wiggum-chat-widget-root');
    const disableBackendFlag = await page.evaluate(
      () => window.__wiggum_widget_config?.disableBackend ?? false,
    );
    expect(disableBackendFlag).toBe(true);

    await page.evaluate(() => {
      window.WiggumChatWidget?.open();
    });
    await page.waitForFunction(() => window.WiggumChatWidget?.isOpen() === true);

    await page.fill('.chat-widget__input', 'hello from playwright');
    await page.click('.chat-widget__send');

    await expect(page.locator('.chat-widget__message-content')).toContainText([
      'hello from playwright',
      'Thanks! I will look into that.',
    ]);
  });
});
