import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import './ChatWidget.css';

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

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
  onMessageResponse?: (userMessage: string) => Promise<string>;
  /** Whether to show the widget initially */
  initiallyOpen?: boolean;
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
}) => {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

    // Get response if handler is provided
    if (onMessageResponse) {
      try {
        const response = await onMessageResponse(userMessage.text);
        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: response,
          sender: 'bot',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, botMessage]);
      } catch (error) {
        console.error('Error getting message response:', error);
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: 'Sorry, I encountered an error. Please try again.',
          sender: 'bot',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } else {
      // Default response if no handler provided
      setTimeout(() => {
        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: 'Thank you for your message! This is a demo response.',
          sender: 'bot',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, botMessage]);
      }, 1000);
    }

    setIsLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
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