// This file acts as a loader/entry point for the chat widget
// It will be injected as a separate entry in the application

// Import the widget bundle statically to avoid code splitting
import './widget-entry';

// Initialize the widget
const loadWidget = () => {
  try {
    console.log('Wiggum Chat Widget loaded successfully');
  } catch (error) {
    console.error('Failed to load Wiggum Chat Widget:', error);
  }
};

// Auto-initialize the widget when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadWidget);
} else {
  loadWidget();
}

// HMR support: re-run loader on updates
try {
  const anyModule = typeof module !== 'undefined' ? (module as any) : undefined;
  if (anyModule && anyModule.hot) {
    anyModule.hot.dispose(() => {
      try { window.WiggumChatWidget?.destroy?.(); } catch {}
    });
    anyModule.hot.accept(() => {
      try { window.WiggumChatWidget?.init?.(); } catch { loadWidget(); }
    });
  }
} catch {}

export {};
