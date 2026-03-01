'use client';
import { useState, useRef, useEffect } from 'react';

export default function EmbedPage() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Sawubona! 👋 I\'m InkanyeziBot, your AI sales assistant from Inkanyezi Technologies.\n\n📋 By chatting, you agree to our POPIA-compliant data policy.\n\nWhat\'s your name?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [stars, setStars] = useState([]);
  const [shootingStars, setShootingStars] = useState([]);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [doorsAnimating, setDoorsAnimating] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const generatedStars = Array.from({ length: 80 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.7 + 0.3,
      duration: Math.random() * 3 + 2,
    }));
    setStars(generatedStars);

    const timer = setTimeout(() => {
      setDoorsOpen(true);
      setTimeout(() => setDoorsAnimating(false), 900);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const triggerShootingStar = () => {
    const newStar = { id: Date.now(), startX: Math.random() * 50, startY: Math.random() * 50 };
    setShootingStars(prev => [...prev, newStar]);
    setTimeout(() => setShootingStars(prev => prev.filter(s => s.id !== newStar.id)), 1000);
  };

  const formatMessage = (text) => {
    if (!text) return '';
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    triggerShootingStar();
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
      background: 'linear-gradient(180deg, #020818 0%, #0B1120 40%, #0f0a1e 100%)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'sans-serif', position: 'relative', overflow: 'hidden'
    }}>

      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.3); }
        }
        @keyframes shootingStar {
          0% { transform: translateX(0) translateY(0) rotate(45deg); opacity: 1; width: 0px; }
          100% { transform: translateX(200px) translateY(200px) rotate(45deg); opacity: 0; width: 80px; }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 10px rgba(249,115,22,0.3), 0 0 20px rgba(249,115,22,0.1); }
          50% { box-shadow: 0 0 20px rgba(249,115,22,0.6), 0 0 40px rgba(249,115,22,0.3); }
        }
        @keyframes rotateStar {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes constellation {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes orbit {
          from { transform: rotate(0deg) translateX(12px) rotate(0deg); }
          to { transform: rotate(360deg) translateX(12px) rotate(-360deg); }
        }
        @keyframes doorLeft {
          from { transform: translateX(0); }
          to { transform: translateX(-100%); }
        }
        @keyframes doorRight {
          from { transform: translateX(0); }
          to { transform: translateX(100%); }
        }
        @keyframes revealContent {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes scanLine {
          0% { top: 0%; opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .message-bubble { animation: fadeInUp 0.3s ease forwards; }
        .star-pulse { animation: twinkle var(--duration, 2s) ease-in-out infinite; }
        .cosmic-border { animation: pulseGlow 3s ease-in-out infinite; }
        .door-left { animation: doorLeft 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
        .door-right { animation: doorRight 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards; }