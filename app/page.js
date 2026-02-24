'use client';
import { useState, useRef, useEffect } from 'react';

export default function Home() {
  const [isOpen, setIsOpen] = useState(false);
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
    <main style={{ minHeight: '100vh', background: '#0B1120' }}>

      {/* Chat Bubble */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed', bottom: '24px', right: '24px',
          width: '64px', height: '64px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #f97316, #c2410c)',
          border: '2px solid rgba(249,115,22,0.4)',
          cursor: 'pointer', fontSize: '26px',
          boxShadow: '0 0 24px rgba(249,115,22,0.5)',
          zIndex: 1000
        }}>
        {isOpen ? '✕' : '⭐'}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div style={{
          position: 'fixed', bottom: '100px', right: '24px',
          width: '370px', height: '560px',
          background: '#0B1120',
          border: '1px solid rgba(249,115,22,0.25)',
          borderRadius: '20px',
          boxShadow: '0 0 40px rgba(249,115,22,0.15), 0 20px 60px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column', zIndex: 999,
          overflow: 'hidden'
        }}>

          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #0f1b35, #1a2a50)',
            borderBottom: '1px solid rgba(249,115,22,0.2)',
            padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: '12px'
          }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #f97316, #c2410c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '22px', flexShrink: 0,
              boxShadow: '0 0 12px rgba(249,115,22,0.5)'
            }}>⭐</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '700', fontSize: '15px', color: '#ffffff' }}>
                InkanyeziBot
              </div>
              <div style={{ fontSize: '11px', color: '#f97316', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
                Online · Inkanyezi Technologies
              </div>
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', textAlign: 'right' }}>
              🇿🇦 SA AI
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '14px',
            display: 'flex', flexDirection: 'column', gap: '10px',
            background: '#0B1120'
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
                  boxShadow: msg.role === 'user' ? '0 0 12px rgba(249,115,22,0.3)' : 'none',
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
                }}>
                  ✦ Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
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
                placeholder="Type a message... (Enter to send)"
                rows={1}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: '16px',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(249,115,22,0.2)',
                  color: '#ffffff', outline: 'none', fontSize: '13px',
                  resize: 'none', lineHeight: '1.5', wordBreak: 'break-word',
                  overflowY: 'auto', maxHeight: '100px',
                  fontFamily: 'sans-serif'
                }}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading}
                style={{
                  width: '42px', height: '42px', borderRadius: '50%',
                  background: isLoading
                    ? 'rgba(249,115,22,0.4)'
                    : 'linear-gradient(135deg, #f97316, #c2410c)',
                  border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer',
                  color: 'white', fontSize: '16px', flexShrink: 0,
                  boxShadow: '0 0 12px rgba(249,115,22,0.4)'
                }}>
                ➤
              </button>
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '6px', textAlign: 'center' }}>
              Press Enter to send · Shift+Enter for new line
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '6px', textAlign: 'center',
            background: '#0f1b35',
            fontSize: '10px', color: 'rgba(255,255,255,0.25)',
            borderTop: '1px solid rgba(249,115,22,0.1)'
          }}>
            ⭐ Powered by Inkanyezi Technologies · AI Automation 🇿🇦
          </div>
        </div>
      )}
    </main>
  );
}