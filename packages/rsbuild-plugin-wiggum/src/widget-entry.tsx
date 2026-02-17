import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { ChatWidget, ChatWidgetProps, InspectResult, WidgetState } from './components/ChatWidget';
import { createOpencodeClient } from '@opencode-ai/sdk/client';

type RuntimeWidgetConfig = ChatWidgetProps & {
  apiEndpoint?: string;
  directory?: string;
};

type RuntimeHotModule = {
  hot?: {
    dispose: (callback: () => void) => void;
    accept: (callback: () => void) => void;
  };
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getRuntimeModule(): RuntimeHotModule | undefined {
  const runtime = globalThis as typeof globalThis & { module?: RuntimeHotModule };
  return runtime.module;
}

function extractTextResponse(parts: unknown): string {
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const record = part as { type?: unknown; text?: unknown };
      if (record.type === 'text' && typeof record.text === 'string') {
        return record.text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

// Global interface for widget API (no global config)
declare global {
  interface Window {
    __wiggum_widget_config?: RuntimeWidgetConfig;
    __WIGGUM_WIDGET_STATE__?: Partial<WidgetState>;
    __WIGGUM_CHAT_MANAGER__?: ChatWidgetManager;
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
  private root: Root | null = null;
  private container: HTMLElement | null = null;
  public isInitialized = false;
  // Removed persistent lastSelection; selection context flows from ChatWidget per-send
  private lastConfig: ChatWidgetProps = {};
  private observer: MutationObserver | null = null;

  init(config: ChatWidgetProps = {}) {
    // Remember config for potential remounts after HMR/DOM replacement
    const injected = window.__wiggum_widget_config ?? {};
    const mergedConfig: RuntimeWidgetConfig = { ...injected, ...config };
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
    const apiEndpoint = mergedConfig.apiEndpoint || `${location.origin}/__opencode__`;
    const directory = document.querySelector('meta[name="wiggum-opencode-dir"]')?.getAttribute('content') || mergedConfig.directory;
    let sessionId: string | undefined;
    let client: ReturnType<typeof createOpencodeClient> | undefined;
    if (apiEndpoint) {
      try {
        client = createOpencodeClient({ baseUrl: apiEndpoint });
      } catch (e) {
        console.warn('Failed to initialize Opencode client:', getErrorMessage(e));
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
    const restoreState = window.__WIGGUM_WIDGET_STATE__;

    this.root.render(
      <div style={{ pointerEvents: 'auto' }}>
        <ChatWidget
          {...mergedConfig}
          title={mergedConfig.title || 'Wiggum Assistant'}
          restoreState={restoreState}
          onStateChange={(state) => {
            try { window.__WIGGUM_WIDGET_STATE__ = state; } catch {}
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
                const outParts: Array<{ type: 'text'; text: string }> = [];
                if (context) {
                  // Filter context to essentials to keep payload small
                  const keep: Record<string, unknown> = {
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
                const reply = extractTextResponse(res.data.parts) || 'OK';
                return reply;
              }
            } catch (err) {
              console.warn('Opencode request failed:', getErrorMessage(err));
            }
            // Fallback response
            return 'Thanks! I will look into that.';
          }}
        />
      </div>
    );

    this.isInitialized = true;

    // Watch for DOM removals (e.g., SPA/HMR replacing body) and remount if needed
    try {
      this.observer?.disconnect();
      this.observer = new MutationObserver(() => {
        const present = document.getElementById('wiggum-chat-widget-root');
        if (!present) {
          console.warn('[Wiggum] Widget container removed from DOM. Attempting to remount.');
          try { this.destroy(); } catch {}
          try { this.init(this.lastConfig); } catch (e) {
            console.warn('[Wiggum] Remount failed:', getErrorMessage(e));
          }
        }
      });
      this.observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    } catch (e) {
      console.debug('[Wiggum] MutationObserver unavailable or failed:', getErrorMessage(e));
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

  private setOpenState(shouldOpen: boolean) {
    const root = document.getElementById('wiggum-chat-widget-root');
    if (!root) return;
    const isCurrentlyOpen = root.querySelector('.chat-widget__window') !== null;
    if (isCurrentlyOpen === shouldOpen) return;
    const toggleButton = root.querySelector<HTMLButtonElement>('.chat-widget__toggle');
    toggleButton?.click();
  }

  open() {
    if (!this.isInitialized) {
      this.init(this.lastConfig);
    }
    queueMicrotask(() => {
      this.setOpenState(true);
    });
  }

  close() {
    if (!this.isInitialized) return;
    this.setOpenState(false);
  }

  isOpen(): boolean {
    const root = document.getElementById('wiggum-chat-widget-root');
    if (!root) return false;
    return root.querySelector('.chat-widget__window') !== null;
  }
}

// Create global instance
const chatWidgetManager: ChatWidgetManager = ((): ChatWidgetManager => {
  // Reuse a global manager across HMR updates to avoid duplicate instances
  if (window.__WIGGUM_CHAT_MANAGER__ instanceof ChatWidgetManager) {
    return window.__WIGGUM_CHAT_MANAGER__;
  }
  const mgr = new ChatWidgetManager();
  window.__WIGGUM_CHAT_MANAGER__ = mgr;
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
  const runtimeModule = getRuntimeModule();
  if (runtimeModule?.hot) {
    runtimeModule.hot.dispose(() => {
      try { chatWidgetManager.destroy(); } catch {}
    });
    runtimeModule.hot.accept(() => {
      try {
        if (!document.getElementById('wiggum-chat-widget-root')) {
          chatWidgetManager.init();
        }
      } catch {}
    });
  }
} catch {}
