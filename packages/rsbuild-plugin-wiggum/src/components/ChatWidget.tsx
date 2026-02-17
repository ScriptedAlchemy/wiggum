import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import './ChatWidget.css';

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

export type WidgetState = {
  isOpen: boolean;
  messages: Message[];
  inputValue: string;
  pendingContext: InspectResult | null;
};

export interface ChatWidgetProps {
  /** Initial messages to display */
  initialMessages?: Message[];
  /** Placeholder text for the input */
  placeholder?: string;
  /** Widget title */
  title?: string;
  /** Custom theme colors */
  theme?: {
    primary?: string;
    secondary?: string;
    background?: string;
    text?: string;
  };
  /** Position of the floating button */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** Custom message handler */
  onSendMessage?: (message: string) => void | Promise<void>;
  /** Custom message response handler */
  onMessageResponse?: (userMessage: string, context?: InspectResult | null) => Promise<string>;
  /** Whether to show the widget initially */
  initiallyOpen?: boolean;
  /** Show the element inspector button in the header */
  showInspectorButton?: boolean;
  /** Callback fired when inspector selects an element */
  onInspectElement?: (info: InspectResult) => void;
  /** Optional: restore previous widget state (for HMR) */
  restoreState?: Partial<WidgetState>;
  /** Optional: report state changes (for HMR persistence) */
  onStateChange?: (state: WidgetState) => void;
}

export type InspectResult = {
  element: HTMLElement;
  tag?: string;
  componentName?: string;
  componentPath?: string[];
  domPath?: string;
  rect?: { x: number; y: number; width: number; height: number };
  source?: { fileName?: string; lineNumber?: number; columnNumber?: number }[];
  id?: string;
  classes?: string[];
  attributes?: Record<string, string>;
  dataset?: Record<string, string>;
  role?: string | null;
  selector?: string;
  accessibleName?: string | null;
  react?: {
    key?: string | number | null;
    props?: Record<string, unknown>;
    state?: unknown;
  };
};

type FiberComponentType = {
  displayName?: string;
  name?: string;
  render?: {
    displayName?: string;
    name?: string;
  };
};

type ReactFiberNode = {
  type?: FiberComponentType | string;
  elementType?: FiberComponentType;
  return?: ReactFiberNode | null;
  _debugOwner?: ReactFiberNode | null;
  _debugSource?: {
    fileName?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
  key?: string | number | null;
  memoizedProps?: Record<string, unknown>;
  pendingProps?: Record<string, unknown>;
  memoizedState?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

declare global {
  interface Window {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown;
    __wiggumStopInspector?: () => void;
  }
}

// Attempt to find the React Fiber for a given DOM node. This uses private internals
// and is best-effort. It may break across React versions. Guarded and optional.
function getFiberFromNode(node: unknown): ReactFiberNode | null {
  if (!isRecord(node)) return null;
  const keys = Object.keys(node);
  const fiberKey = keys.find((k) => k.startsWith('__reactFiber$'))
    || keys.find((k) => k.startsWith('__reactInternalInstance$'))
    || keys.find((k) => k.startsWith('__reactContainer$'));
  if (!fiberKey) return null;
  const maybeFiber = node[fiberKey];
  return isRecord(maybeFiber) ? (maybeFiber as ReactFiberNode) : null;
}

function getDisplayNameFromFiber(fiber: ReactFiberNode | null | undefined): string | undefined {
  if (!fiber) return undefined;
  const t = fiber.type || fiber.elementType;
  if (!t) return undefined;
  if (typeof t === 'string') return t; // host component, e.g., 'div'
  // Function/class/forwardRef/memo components
  return (
    t.displayName || t.name || (t.render && (t.render.displayName || t.render.name)) ||
    (fiber.elementType && (fiber.elementType.displayName || fiber.elementType.name)) || undefined
  );
}

function buildComponentPath(fiber: ReactFiberNode | null | undefined): string[] | undefined {
  if (!fiber) return undefined;
  const names: string[] = [];
  let f: ReactFiberNode | null = fiber;
  const visited = new Set<ReactFiberNode>();
  while (f && !visited.has(f)) {
    visited.add(f);
    const name = getDisplayNameFromFiber(f);
    if (name && typeof f.type !== 'string') {
      names.push(name);
    }
    f = f.return || f._debugOwner || null;
  }
  return names.length ? names.reverse() : undefined;
}

function buildSourceTrail(fiber: ReactFiberNode | null | undefined): InspectResult['source'] | undefined {
  if (!fiber) return undefined;
  const out: NonNullable<InspectResult['source']> = [];
  let f: ReactFiberNode | null = fiber;
  const seen = new Set<ReactFiberNode>();
  while (f && !seen.has(f)) {
    seen.add(f);
    if (f._debugSource) {
      const { fileName, lineNumber, columnNumber } = f._debugSource;
      out.push({ fileName, lineNumber, columnNumber });
    }
    f = f.return || f._debugOwner || null;
  }
  return out.length ? out.reverse() : undefined;
}

function getDomPath(el: HTMLElement | null | undefined): string | undefined {
  if (!el) return undefined;
  const parts: string[] = [];
  let node: HTMLElement | null = el;
  while (node && node.nodeType === 1 && parts.length < 30) {
    const name = node.nodeName.toLowerCase();
    let selector = name;
    if (node.id) {
      selector += `#${CSS.escape(node.id)}`;
      parts.unshift(selector);
      break;
    } else {
      const parent = node.parentElement;
      if (parent) {
        const thisNode = node as HTMLElement; // non-null within loop
        const siblings = Array.from(parent.children).filter((c) => (c as HTMLElement).tagName === thisNode.tagName);
        const idx = siblings.indexOf(thisNode);
        if (idx >= 0) selector += `:nth-of-type(${idx + 1})`;
      }
    }
    parts.unshift(selector);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

function sanitizeValue(value: unknown, depth = 2): unknown {
  if (value == null) return value;
  const t = typeof value;
  if (t === 'string') return (value as string).slice(0, 500);
  if (t === 'number' || t === 'boolean') return value;
  if (t === 'function') return undefined;
  if (Array.isArray(value)) {
    if (depth <= 0) return '[Array]';
    return (value as unknown[]).slice(0, 10).map((v) => sanitizeValue(v, depth - 1));
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const k of Object.keys(obj)) {
      if (count >= 20) break;
      const v = obj[k];
      const sv = sanitizeValue(v, depth - 1);
      if (sv !== undefined) {
        out[k] = sv;
        count++;
      }
    }
    return out;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function getReactInfo(fiber: ReactFiberNode | null | undefined): InspectResult['react'] | undefined {
  if (!fiber) return undefined;
  const key = fiber.key ?? null;
  let props: Record<string, unknown> | undefined;
  let state: unknown;
  try {
    const rawProps = fiber.memoizedProps ?? fiber.pendingProps;
    if (rawProps && typeof rawProps === 'object') {
      const filtered: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rawProps as Record<string, unknown>)) {
        if (typeof v === 'function') continue;
        filtered[k] = sanitizeValue(v);
      }
      props = filtered;
    }
  } catch {}
  try {
    if (fiber.memoizedState !== undefined) {
      state = sanitizeValue(fiber.memoizedState);
    }
  } catch {}
  return { key, props, state };
}

function getAttributes(el: HTMLElement): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    const name = a.name;
    if (name === 'style' || name.startsWith('on')) continue;
    if (name === 'class' || name === 'id' || name === 'role' || name.startsWith('data-') || name.startsWith('aria-')) {
      attrs[name] = a.value;
    }
  }
  // Some semantic attributes that help selecting
  const include = ['name', 'type', 'href', 'title', 'alt', 'value'];
  for (const k of include) {
    const v = el.getAttribute(k);
    if (v && !(k in attrs)) attrs[k] = v;
  }
  return attrs;
}

function getDataset(el: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(el.dataset)) {
    if (v != null) out[k] = String(v).slice(0, 200);
  }
  return out;
}

function getAccessibleName(el: HTMLElement): string | null {
  return el.getAttribute('aria-label') || el.getAttribute('alt') || null;
}

function buildUniqueSelector(el: HTMLElement): string {
  // If ID exists and is unique
  if (el.id) {
    const idSel = `#${CSS.escape(el.id)}`;
    try { if (document.querySelectorAll(idSel).length === 1) return idSel; } catch {}
  }
  const classes = Array.from(el.classList).slice(0, 3).map((c) => `.${CSS.escape(c)}`).join('');
  const tag = el.tagName.toLowerCase();
  let base = `${tag}${classes}`;
  try { if (document.querySelectorAll(base).length === 1) return base; } catch {}
  const parent = el.parentElement;
  if (parent) {
    const idx = Array.from(parent.children).filter((c) => (c as HTMLElement).tagName === el.tagName).indexOf(el);
    if (idx >= 0) base += `:nth-of-type(${idx + 1})`;
    try { if (document.querySelectorAll(base).length === 1) return base; } catch {}
    const parentSel = buildUniqueSelector(parent);
    const combined = `${parentSel} > ${base}`;
    try { if (document.querySelectorAll(combined).length === 1) return combined; } catch {}
    return combined;
  }
  return base;
}

// Lightweight element inspector. Draws a highlight overlay and captures a click to select.
function startElementInspector(onPick: (info: InspectResult) => void, options?: { skipWithin?: HTMLElement | null }) {
  const overlay = document.createElement('div');
  overlay.id = 'wiggum-inspector-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0px',
    left: '0px',
    width: '0px',
    height: '0px',
    border: '2px solid #0ea5e9',
    background: 'rgba(14, 165, 233, 0.1)',
    zIndex: '2147483647',
    pointerEvents: 'none',
    boxShadow: '0 0 0 999999px rgba(14, 165, 233, 0.05)',
    transition: 'all 0.04s ease',
  } as Partial<CSSStyleDeclaration>);

  const tooltip = document.createElement('div');
  tooltip.id = 'wiggum-inspector-tooltip';
  Object.assign(tooltip.style, {
    position: 'fixed',
    padding: '4px 6px',
    background: 'rgba(17, 24, 39, 0.98)',
    color: '#fff',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial',
    fontSize: '12px',
    borderRadius: '4px',
    zIndex: '2147483647',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    maxWidth: '50vw',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    transform: 'translate(-9999px, -9999px)',
  } as Partial<CSSStyleDeclaration>);

  const rootOverlayHost = document.body;
  rootOverlayHost.appendChild(overlay);
  rootOverlayHost.appendChild(tooltip);

  // Allow interacting with underlying page by disabling widget pointer events while active
  const widgetRoot = document.getElementById('wiggum-chat-widget-root');
  const prevWidgetPointer = widgetRoot?.style.pointerEvents;
  if (widgetRoot) widgetRoot.style.pointerEvents = 'none';
  const prevCursor = document.body.style.cursor;
  document.body.style.cursor = 'crosshair';

  const isWithinSkip = (el: Node | null | undefined) => {
    if (!el) return false;
    let n: Node | null = el;
    while (n && n instanceof HTMLElement) {
      if (options?.skipWithin && n === options.skipWithin) return true;
      if (n.id === 'wiggum-chat-widget-root') return true;
      n = n.parentElement;
    }
    return false;
  };

  function highlight(el: Element | null) {
    if (!el || !(el instanceof HTMLElement)) {
      overlay.style.width = '0px';
      overlay.style.height = '0px';
      tooltip.style.transform = 'translate(-9999px, -9999px)';
      return;
    }
    const rect = el.getBoundingClientRect();
    overlay.style.transform = `translate(${Math.max(0, rect.left)}px, ${Math.max(0, rect.top)}px)`;
    overlay.style.width = `${Math.max(0, rect.width)}px`;
    overlay.style.height = `${Math.max(0, rect.height)}px`;

    // Tooltip content and positioning
    try {
      const fiber = getFiberFromNode(el);
      const name = getDisplayNameFromFiber(fiber) || el.tagName.toLowerCase();
      const path = buildComponentPath(fiber);
      const shortAttrs = [el.id ? `#${el.id}` : '', Array.from(el.classList).slice(0, 2).map((c) => `.${c}`).join('')]
        .filter(Boolean)
        .join('');
      const label = `${name}${shortAttrs ? ' ' + shortAttrs : ''}${path?.length ? ` — ${path.join(' > ')}` : ''}`;
      tooltip.textContent = label || '';
      const margin = 6;
      let tx = rect.left + margin;
      let ty = rect.top - (tooltip.offsetHeight || 18) - margin;
      if (ty < 4) ty = rect.bottom + margin;
      if (tx + (tooltip.offsetWidth || 120) > window.innerWidth - 4) {
        tx = window.innerWidth - (tooltip.offsetWidth || 120) - 4;
      }
      tooltip.style.transform = `translate(${Math.max(4, tx)}px, ${Math.max(4, ty)}px)`;
    } catch {
      tooltip.style.transform = 'translate(-9999px, -9999px)';
    }
  }

  const onMove = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (!target) return;
    if (isWithinSkip(target)) {
      highlight(null);
      return;
    }
    highlight(target);
  };

  const cleanup = () => {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeydown, true);
    overlay.remove();
    tooltip.remove();
    if (widgetRoot) widgetRoot.style.pointerEvents = prevWidgetPointer || '';
    document.body.style.cursor = prevCursor || '';
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
    }
  };

  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = (e.target as Element) as HTMLElement;
    if (el && !isWithinSkip(el)) {
      const fiber = getFiberFromNode(el);
      const componentName = getDisplayNameFromFiber(fiber);
      let componentPath = buildComponentPath(fiber);
      // Best-effort: enrich path using React DevTools hook when available
      try {
        const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (hook && fiber) {
          if (!componentPath || componentPath.length === 0) {
            const ownerPath: string[] = [];
            let f: ReactFiberNode | null = fiber;
            const visited = new Set<ReactFiberNode>();
            while (f && !visited.has(f)) {
              visited.add(f);
              if (f._debugOwner) {
                const n = getDisplayNameFromFiber(f._debugOwner);
                if (n) ownerPath.push(n);
                f = f._debugOwner;
              } else {
                f = f.return || null;
              }
            }
            if (ownerPath.length) componentPath = ownerPath.reverse();
          }
        }
      } catch {}
      const rect = el.getBoundingClientRect();
      const info: InspectResult = {
        element: el,
        componentName: componentName || (el.tagName ? el.tagName.toLowerCase() : undefined),
        componentPath,
        tag: el.tagName.toLowerCase(),
        domPath: getDomPath(el),
        rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        source: buildSourceTrail(fiber),
        id: el.id || undefined,
        classes: Array.from(el.classList || []),
        attributes: getAttributes(el),
        dataset: getDataset(el),
        role: el.getAttribute('role'),
        selector: buildUniqueSelector(el),
        accessibleName: getAccessibleName(el),
        react: getReactInfo(fiber),
      };
      try {
        window.dispatchEvent(new CustomEvent('wiggum:inspect-select', { detail: info }));
      } catch {}
      onPick(info);
    }
    cleanup();
  };

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeydown, true);

  // Initial hint: highlight what's under the cursor
  highlight(document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2));
  return cleanup;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({
  initialMessages = [],
  placeholder = 'Type your message...',
  title = 'Chat Support',
  theme = {},
  position = 'bottom-right',
  onSendMessage,
  onMessageResponse,
  initiallyOpen = false,
  showInspectorButton = true,
  onInspectElement,
  restoreState,
  onStateChange,
}) => {
  const [isOpen, setIsOpen] = useState(restoreState?.isOpen ?? initiallyOpen);
  const [messages, setMessages] = useState<Message[]>(restoreState?.messages ?? initialMessages);
  const [inputValue, setInputValue] = useState(restoreState?.inputValue ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [pendingContext, setPendingContext] = useState<InspectResult | null>(restoreState?.pendingContext ?? null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Report state changes (for HMR persistence)
  useEffect(() => {
    if (!onStateChange) return;
    const snapshot: WidgetState = { isOpen, messages, inputValue, pendingContext };
    try { onStateChange(snapshot); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, messages, inputValue, pendingContext]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue.trim(),
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Call custom message handler if provided
    if (onSendMessage) {
      await onSendMessage(userMessage.text);
    }

    // Only add a response when handler provided and succeeds
    if (onMessageResponse) {
      try {
        const response = await onMessageResponse(userMessage.text, pendingContext);
        if (response && response.trim()) {
          const botMessage: Message = {
            id: (Date.now() + 1).toString(),
            text: response,
            sender: 'bot',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, botMessage]);
        }
      } catch (error) {
        console.error('Error getting message response:', error);
        // No fallback message
      }
    }

    setIsLoading(false);
    // Clear pending selection context after it's been sent once
    if (pendingContext) setPendingContext(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const startInspecting = () => {
    if (inspecting) {
      try { window.__wiggumStopInspector?.(); } catch {}
      setInspecting(false);
      return;
    }
    setInspecting(true);
    const stop = startElementInspector((info) => {
      // Prefer callback if provided
      if (onInspectElement) {
        try { onInspectElement(info); } catch (err) { console.warn('onInspectElement error:', err); }
      }
      // Optional: drop a message into the chat
      try {
        const summary = `Selected: ${info.componentName || info.tag || 'unknown'}\nSelector: ${info.selector || info.domPath || info.tag}${info.componentPath?.length ? `\nPath: ${info.componentPath.join(' > ')}` : ''}${info.id ? `\n#${info.id}` : ''}${info.classes?.length ? `\n.${info.classes.join('.')}` : ''}`;
        const botMessage: Message = {
          id: (Date.now() + 2).toString(),
          text: summary,
          sender: 'bot',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, botMessage]);
        // Keep this selection as pending context for the next user message
        setPendingContext(info);
      } catch {}
      setInspecting(false);
    });
    // Safety: end inspecting if widget unmounts
    const onUnmountCleanup = () => { try { stop(); } catch {} };
    // Store on window so we can cancel if needed
    window.__wiggumStopInspector = onUnmountCleanup;
  };

  const positionClasses = {
    'bottom-right': 'chat-widget--bottom-right',
    'bottom-left': 'chat-widget--bottom-left',
    'top-right': 'chat-widget--top-right',
    'top-left': 'chat-widget--top-left',
  };

  const customStyles = {
    '--chat-primary': theme.primary || '#007bff',
    '--chat-secondary': theme.secondary || '#6c757d',
    '--chat-background': theme.background || '#ffffff',
    '--chat-text': theme.text || '#333333',
  } as React.CSSProperties;

  return (
    <div 
      className={clsx('chat-widget', positionClasses[position])}
      style={customStyles}
    >
      {/* Floating Button */}
      <button
        className={clsx('chat-widget__toggle', { 'chat-widget__toggle--open': isOpen })}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"></path>
          </svg>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="chat-widget__window">
          {/* Header */}
          <div className="chat-widget__header">
            <h3 className="chat-widget__title">{title}</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {showInspectorButton && (
                <button
                  className="chat-widget__close"
                  onClick={startInspecting}
                  aria-label={inspecting ? 'Inspecting... (ESC to cancel)' : 'Inspect element'}
                  title={inspecting ? 'Inspecting... (ESC to cancel)' : 'Inspect element'}
                >
                  {/* Crosshair icon */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"></circle>
                    <line x1="12" y1="2" x2="12" y2="6"></line>
                    <line x1="12" y1="18" x2="12" y2="22"></line>
                    <line x1="2" y1="12" x2="6" y2="12"></line>
                    <line x1="18" y1="12" x2="22" y2="12"></line>
                  </svg>
                </button>
              )}
              <button
                className="chat-widget__close"
                onClick={() => setIsOpen(false)}
                aria-label="Close chat"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="chat-widget__messages">
            {messages.length === 0 && (
              <div className="chat-widget__empty">
                <p>Welcome! How can I help you today?</p>
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={clsx('chat-widget__message', {
                  'chat-widget__message--user': message.sender === 'user',
                  'chat-widget__message--bot': message.sender === 'bot',
                })}
              >
                <div className="chat-widget__message-content">
                  {message.text}
                </div>
                <div className="chat-widget__message-time">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="chat-widget__message chat-widget__message--bot">
                <div className="chat-widget__message-content">
                  <div className="chat-widget__typing">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="chat-widget__input-container">
            <textarea
              className="chat-widget__input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={placeholder}
              rows={1}
              disabled={isLoading}
            />
            <button
              className="chat-widget__send"
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              aria-label="Send message"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22,2 15,22 11,13 2,9 22,2"></polygon>
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
