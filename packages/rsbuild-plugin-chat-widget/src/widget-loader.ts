// This file acts as a loader/entry point for the chat widget
// It will be injected as a separate entry in the application

import type { ChatWidgetProps } from './components/ChatWidget';
// Import the widget bundle statically to avoid code splitting
import './widget-entry';

declare global {
  interface Window {
    __WIGGUM_CHAT_CONFIG__?: ChatWidgetProps;
  }
}

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

export {};