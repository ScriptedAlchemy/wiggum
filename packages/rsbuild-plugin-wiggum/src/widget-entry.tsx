import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatWidget, ChatWidgetProps, InspectResult, WidgetState } from './components/ChatWidget';
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
  // Removed persistent lastSelection; selection context flows from ChatWidget per-send
  private lastConfig: ChatWidgetProps = {};
  private observer: MutationObserver | null = null;

  init(config: ChatWidgetProps = {}) {
    console.log('Wiggum Chat Widget init called with config:', config);
    // Remember config for potential remounts after HMR/DOM replacement
    const injected = (window as any).__wiggum_widget_config || {};
    const mergedConfig: ChatWidgetProps = { ...(injected as any), ...config };
    this.lastConfig = { ...mergedConfig };

    // If the DOM container vanished (e.g., due to framework replacing <body>), reset state
    const existing = document.getElementById('wiggum-chat-widget-root');
    if (this.isInitialized && !existing) {
      console.warn('[Wiggum] Widget state says initialized but container is missing. Resetting.');
      this.isInitialized = false;
      this.root = null;
      this.container = null;
    }

    if (this.isInitialized) {
      console.warn('Wiggum Chat Widget is already initialized');
      return;
    }

    // Discover opencode backend via injected config or same-origin proxy
    const apiEndpoint = (mergedConfig as any).apiEndpoint || `${location.origin}/__opencode__`;
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
    // Restore previous widget state across HMR if present
    const w = window as any;
    const restoreState: Partial<WidgetState> | undefined = w.__WIGGUM_WIDGET_STATE__;

    this.root.render(
      <div style={{ pointerEvents: 'auto' }}>
        <ChatWidget
          {...mergedConfig}
          title={mergedConfig.title || 'Wiggum Assistant'}
          restoreState={restoreState}
          onStateChange={(state) => {
            try { (window as any).__WIGGUM_WIDGET_STATE__ = state; } catch {}
          }}
          onMessageResponse={async (text: string, context?: InspectResult | null) => {
            // Lazy-create session on first message
            try {
              if (client && !sessionId) {
                // Create a new chat session
                const created = await client.session.create({ body: {
                  title: 'Wiggum Chat',
                } , ...(directory ? { query: { directory } } : {}) });
                if (!created.data) throw created.error ?? new Error('Failed to create session');
                sessionId = created.data.id;
              }
              if (client && sessionId) {
                const outParts: any[] = [];
                if (context) {
                  // Filter context to essentials to keep payload small
                  const keep: Record<string, any> = {
                    tag: context.tag,
                    id: context.id,
                    classes: context.classes,
                    selector: context.selector,
                    domPath: context.domPath,
                    role: context.role,
                    accessibleName: context.accessibleName,
                    componentName: context.componentName,
                    componentPath: context.componentPath,
                    source: context.source,
                    attributes: context.attributes,
                    dataset: context.dataset,
                    react: context.react ? { key: context.react.key, props: context.react.props } : undefined,
                  };
                  const contextText = `Selection context (most recent):\n${JSON.stringify(keep, null, 2)}\n----`;
                  outParts.push({ type: 'text', text: contextText });
                }
                outParts.push({ type: 'text', text });
                const res = await client.session.prompt({
                  path: { id: sessionId },
                  ...(directory ? { query: { directory } } : {}),
                  body: { parts: outParts },
                });
                if (!res.data) throw res.error ?? new Error('No response data');
                const inParts = res.data.parts || [];
                const reply = inParts
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

    // Watch for DOM removals (e.g., SPA/HMR replacing body) and remount if needed
    try {
      this.observer?.disconnect();
      this.observer = new MutationObserver(() => {
        const present = document.getElementById('wiggum-chat-widget-root');
        if (!present) {
          console.warn('[Wiggum] Widget container removed from DOM. Attempting to remount.');
          try { this.destroy(); } catch {}
          try { this.init(this.lastConfig); } catch (e) {
            console.warn('[Wiggum] Remount failed:', (e as any)?.message ?? e);
          }
        }
      });
      this.observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    } catch (e) {
      console.debug('[Wiggum] MutationObserver unavailable or failed:', (e as any)?.message ?? e);
    }
  }

  destroy() {
    if (!this.isInitialized) return;

    try { this.observer?.disconnect(); } catch {}
    this.observer = null;

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
const chatWidgetManager: ChatWidgetManager = ((): ChatWidgetManager => {
  // Reuse a global manager across HMR updates to avoid duplicate instances
  const w = window as any;
  if (w.__WIGGUM_CHAT_MANAGER__ && w.__WIGGUM_CHAT_MANAGER__ instanceof ChatWidgetManager) {
    return w.__WIGGUM_CHAT_MANAGER__ as ChatWidgetManager;
  }
  const mgr = new ChatWidgetManager();
  w.__WIGGUM_CHAT_MANAGER__ = mgr;
  return mgr;
})();

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

// HMR support: cleanup and remount on module replacement
try {
  const anyModule = typeof module !== 'undefined' ? (module as any) : undefined;
  if (anyModule && anyModule.hot) {
    anyModule.hot.dispose(() => {
      try { chatWidgetManager.destroy(); } catch {}
    });
    anyModule.hot.accept(() => {
      try {
        if (!document.getElementById('wiggum-chat-widget-root')) {
          chatWidgetManager.init();
        }
      } catch {}
    });
  }
} catch {}
