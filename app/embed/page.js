'use client';
import { useState, useRef, useEffect } from 'react';

export default function EmbedPage() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Sawubona! 👋 I\'m InkanyeziBot.\n\nTo get started, please share:\n👤 Your name\n🏢 Business name\n📞 Phone number\n📧 Email address' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatMessage = (text) => {
    if (!text) return '';
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await response.json();
      setMessages([...newMessages, { role: 'assistant', content: data.message }]);
    } catch (error) {
      setMessages([...newMessages, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      width: '100%', height: '100vh',
      background: '#0B1120',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'sans-serif'
    }}>
      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '14px',
        display: 'flex', flexDirection: 'column', gap: '10px',
      }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            alignItems: 'flex-end', gap: '6px'
          }}>
            {msg.role === 'assistant' && (
              <div style={{
                width: '26px', height: '26px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #f97316, #c2410c)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', flexShrink: 0
              }}>⭐</div>
            )}
            <div style={{
              maxWidth: '78%', padding: '10px 14px', borderRadius: '14px',
              fontSize: '13px', lineHeight: '1.6', wordBreak: 'break-word',
              background: msg.role === 'user'
                ? 'linear-gradient(135deg, #f97316, #c2410c)'
                : 'rgba(255,255,255,0.06)',
              color: '#ffffff',
              border: msg.role === 'user' ? 'none' : '1px solid rgba(249,115,22,0.15)',
              borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '14px',
              borderBottomRightRadius: msg.role === 'user' ? '4px' : '14px',
            }}
              dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
            />
          </div>
        ))}
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
            <div style={{
              width: '26px', height: '26px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #f97316, #c2410c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px'
            }}>⭐</div>
            <div style={{
              background: 'rgba(255,255,255,0.06)', padding: '10px 16px',
              borderRadius: '14px', borderBottomLeftRadius: '4px',
              fontSize: '13px', color: '#f97316',
              border: '1px solid rgba(249,115,22,0.15)'
            }}>✦ Thinking...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 14px',
        borderTop: '1px solid rgba(249,115,22,0.15)',
        background: '#0f1b35',
      }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Type a message..."
            rows={1}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: '16px',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(249,115,22,0.2)',
              color: '#ffffff', outline: 'none', fontSize: '13px',
              resize: 'none', lineHeight: '1.5',
              fontFamily: 'sans-serif'
            }}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading}
            style={{
              width: '42px', height: '42px', borderRadius: '50%',
              background: isLoading ? 'rgba(249,115,22,0.4)' : 'linear-gradient(135deg, #f97316, #c2410c)',
              border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer',
              color: 'white', fontSize: '16px', flexShrink: 0,
              boxShadow: '0 0 12px rgba(249,115,22,0.4)'
            }}>➤</button>
        </div>
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '6px', textAlign: 'center' }}>
          ⭐ Powered by Inkanyezi Technologies · AI Automation 🇿🇦
        </div>
      </div>
    </div>
  );
}