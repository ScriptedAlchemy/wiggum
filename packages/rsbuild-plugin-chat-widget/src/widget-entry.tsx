import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatWidget, ChatWidgetProps } from './components/ChatWidget';
import { createOpencodeClient } from '@opencode-ai/sdk/client';

// Global interface for widget API (no global config)
declare global {
  interface Window {
    WiggumChatWidget?: {
      init: (config?: ChatWidgetProps) => void;
      destroy: () => void;
      open: () => void;
      close: () => void;
      isOpen: () => boolean;
    };
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

    // Discover opencode backend via meta tags injected by the plugin
    // Use same-origin passthrough proxy installed by the plugin
    const apiEndpoint = `${location.origin}/__opencode__`;
    const directory = document.querySelector('meta[name="wiggum-opencode-dir"]')?.getAttribute('content') || (config as any)['directory'];
    let sessionId: string | undefined;
    let client: ReturnType<typeof createOpencodeClient> | undefined;
    if (apiEndpoint) {
      try {
        client = createOpencodeClient({ baseUrl: apiEndpoint });
      } catch (e) {
        console.warn('Failed to initialize Opencode client:', (e as any)?.message ?? e);
      }
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
        <ChatWidget
          {...config}
          title={config.title || 'Wiggum Assistant'}
          onMessageResponse={async (text: string) => {
            // Lazy-create session on first message
            try {
              if (client && !sessionId) {
                const created = await client.session.create({ body: { title: 'Wiggum Chat' }, ...(directory ? { query: { directory } } : {}) });
                if (!created.data) throw created.error ?? new Error('Failed to create session');
                sessionId = created.data.id;
              }
              if (client && sessionId) {
                const res = await client.session.prompt({
                  path: { id: sessionId },
                  ...(directory ? { query: { directory } } : {}),
                  body: { parts: [{ type: 'text', text }] as any },
                });
                if (!res.data) throw res.error ?? new Error('No response data');
                const parts = res.data.parts || [];
                const reply = parts
                  .map((p: any) => (p.type === 'text' ? p.text : ''))
                  .filter(Boolean)
                  .join('\n') || 'OK';
                return reply;
              }
            } catch (err) {
              console.warn('Opencode request failed:', (err as any)?.message ?? err);
            }
            // Fallback response
            return 'Thanks! I will look into that.';
          }}
        />
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

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (!chatWidgetManager.isInitialized) {
      chatWidgetManager.init();
    }
  });
} else if (!chatWidgetManager.isInitialized) {
  chatWidgetManager.init();
}
