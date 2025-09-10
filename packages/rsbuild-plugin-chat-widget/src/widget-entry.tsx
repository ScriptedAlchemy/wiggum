import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatWidget, ChatWidgetProps } from './components/ChatWidget';

// Global interface for widget configuration
declare global {
  interface Window {
    WiggumChatWidget?: {
      init: (config?: ChatWidgetProps) => void;
      destroy: () => void;
      open: () => void;
      close: () => void;
      isOpen: () => boolean;
    };
    __WIGGUM_CHAT_CONFIG__?: ChatWidgetProps;
  }
}

class ChatWidgetManager {
  private root: any = null;
  private container: HTMLElement | null = null;
  public isInitialized = false;

  init(config: ChatWidgetProps = {}) {
    console.log('Wiggum Chat Widget init called with config:', config);
    
    if (this.isInitialized) {
      console.warn('Wiggum Chat Widget is already initialized');
      return;
    }

    // Create container
    this.container = document.createElement('div');
    this.container.id = 'wiggum-chat-widget-root';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 9999;
    `;
    
    // Make only the widget interactive
    this.container.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    document.body.appendChild(this.container);

    // Create React root and render widget
    this.root = createRoot(this.container);
    this.root.render(
      <div style={{ pointerEvents: 'auto' }}>
        <ChatWidget {...config} />
      </div>
    );

    this.isInitialized = true;
    console.log('Wiggum Chat Widget initialization complete. Container added to DOM:', document.getElementById('wiggum-chat-widget-root'));
  }

  destroy() {
    if (!this.isInitialized) return;

    if (this.root) {
      this.root.unmount();
      this.root = null;
    }

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }

    this.isInitialized = false;
  }

  open() {
    // This would need to be implemented with a ref or state management
    console.log('Opening chat widget');
  }

  close() {
    // This would need to be implemented with a ref or state management
    console.log('Closing chat widget');
  }

  isOpen(): boolean {
    // This would need to be implemented with a ref or state management
    return false;
  }
}

// Create global instance
const chatWidgetManager = new ChatWidgetManager();

// Expose global API
window.WiggumChatWidget = {
  init: (config) => chatWidgetManager.init(config),
  destroy: () => chatWidgetManager.destroy(),
  open: () => chatWidgetManager.open(),
  close: () => chatWidgetManager.close(),
  isOpen: () => chatWidgetManager.isOpen(),
};

// Auto-initialize if config is provided
if (window.__WIGGUM_CHAT_CONFIG__) {
  console.log('Auto-initializing widget with config from window.__WIGGUM_CHAT_CONFIG__');
  chatWidgetManager.init(window.__WIGGUM_CHAT_CONFIG__);
} else {
  console.log('No __WIGGUM_CHAT_CONFIG__ found on window');
}

// Auto-initialize on DOM ready if no config was provided
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (!chatWidgetManager.isInitialized && !window.__WIGGUM_CHAT_CONFIG__) {
      chatWidgetManager.init();
    }
  });
} else if (!chatWidgetManager.isInitialized && !window.__WIGGUM_CHAT_CONFIG__) {
  chatWidgetManager.init();
}