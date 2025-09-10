import { test, expect } from '@playwright/test';

test.describe('Chat Widget', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display chat widget toggle button', async ({ page }) => {
    const toggleButton = page.locator('.chat-widget__toggle');
    await expect(toggleButton).toBeVisible();
    await expect(toggleButton).toHaveCSS('position', 'relative');
    
    const chatWidget = page.locator('.chat-widget');
    await expect(chatWidget).toBeVisible();
    await expect(chatWidget).toHaveClass(/chat-widget--bottom-right/);
  });

  test('should be positioned at bottom right by default', async ({ page }) => {
    const chatWidget = page.locator('.chat-widget');
    await expect(chatWidget).toHaveCSS('position', 'fixed');
    await expect(chatWidget).toHaveCSS('bottom', '20px');
    await expect(chatWidget).toHaveCSS('right', '20px');
  });

  test('should open chat window when toggle button is clicked', async ({ page }) => {
    const toggleButton = page.locator('.chat-widget__toggle');
    const chatWindow = page.locator('.chat-widget__window');
    
    await expect(chatWindow).not.toBeVisible();
    
    await toggleButton.click();
    
    await expect(chatWindow).toBeVisible();
    await expect(toggleButton).toHaveClass(/chat-widget__toggle--open/);
  });

  test('should display correct title in chat header', async ({ page }) => {
    const toggleButton = page.locator('.chat-widget__toggle');
    await toggleButton.click();
    
    const title = page.locator('.chat-widget__title');
    await expect(title).toContainText('Rstack Help & Support');
  });

  test('should close chat window when close button is clicked', async ({ page }) => {
    const toggleButton = page.locator('.chat-widget__toggle');
    await toggleButton.click();
    
    const chatWindow = page.locator('.chat-widget__window');
    await expect(chatWindow).toBeVisible();
    
    const closeButton = page.locator('.chat-widget__close');
    await closeButton.click();
    
    await expect(chatWindow).not.toBeVisible();
  });

  test('should have input field and send button', async ({ page }) => {
    const toggleButton = page.locator('.chat-widget__toggle');
    await toggleButton.click();
    
    const input = page.locator('.chat-widget__input');
    const sendButton = page.locator('.chat-widget__send');
    
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('placeholder', 'Type your message...');
    await expect(sendButton).toBeVisible();
  });

  test('should allow typing messages', async ({ page }) => {
    const toggleButton = page.locator('.chat-widget__toggle');
    await toggleButton.click();
    
    const input = page.locator('.chat-widget__input');
    await input.fill('Hello, I need help!');
    
    await expect(input).toHaveValue('Hello, I need help!');
  });

  test('should send message when send button is clicked', async ({ page }) => {
    const toggleButton = page.locator('.chat-widget__toggle');
    await toggleButton.click();
    
    const input = page.locator('.chat-widget__input');
    const sendButton = page.locator('.chat-widget__send');
    const messages = page.locator('.chat-widget__messages');
    
    await input.fill('Test message');
    await sendButton.click();
    
    const userMessage = messages.locator('.chat-widget__message--user').last();
    await expect(userMessage).toContainText('Test message');
  });

  test('should show typing indicator when waiting for response', async ({ page }) => {
    const toggleButton = page.locator('.chat-widget__toggle');
    await toggleButton.click();
    
    const input = page.locator('.chat-widget__input');
    const sendButton = page.locator('.chat-widget__send');
    
    await input.fill('Test message');
    await sendButton.click();
    
    const typingIndicator = page.locator('.chat-widget__typing');
    await expect(typingIndicator).toBeVisible();
  });

  test('should apply custom primary color', async ({ page }) => {
    const toggleButton = page.locator('.chat-widget__toggle');
    
    const computedStyle = await toggleButton.evaluate((el) => {
      return window.getComputedStyle(el).getPropertyValue('background-color');
    });
    
    expect(computedStyle).toBe('rgb(0, 123, 255)');
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    const chatWidget = page.locator('.chat-widget');
    await expect(chatWidget).toBeVisible();
    
    const toggleButton = page.locator('.chat-widget__toggle');
    await toggleButton.click();
    
    const chatWindow = page.locator('.chat-widget__window');
    await expect(chatWindow).toBeVisible();
    
    const windowWidth = await chatWindow.evaluate((el) => el.offsetWidth);
    expect(windowWidth).toBeLessThanOrEqual(350);
  });

  test('should persist messages in conversation', async ({ page }) => {
    const toggleButton = page.locator('.chat-widget__toggle');
    await toggleButton.click();
    
    const input = page.locator('.chat-widget__input');
    const sendButton = page.locator('.chat-widget__send');
    const messages = page.locator('.chat-widget__messages');
    
    await input.fill('First message');
    await sendButton.click();
    
    await page.waitForTimeout(500);
    
    await input.fill('Second message');
    await sendButton.click();
    
    const allMessages = messages.locator('.chat-widget__message--user');
    await expect(allMessages).toHaveCount(2);
  });

  test('should clear input after sending message', async ({ page }) => {
    const toggleButton = page.locator('.chat-widget__toggle');
    await toggleButton.click();
    
    const input = page.locator('.chat-widget__input');
    const sendButton = page.locator('.chat-widget__send');
    
    await input.fill('Test message');
    await sendButton.click();
    
    await expect(input).toHaveValue('');
  });

  test('should disable send button when input is empty', async ({ page }) => {
    const toggleButton = page.locator('.chat-widget__toggle');
    await toggleButton.click();
    
    const sendButton = page.locator('.chat-widget__send');
    await expect(sendButton).toBeDisabled();
    
    const input = page.locator('.chat-widget__input');
    await input.fill('Test');
    await expect(sendButton).not.toBeDisabled();
    
    await input.clear();
    await expect(sendButton).toBeDisabled();
  });
});