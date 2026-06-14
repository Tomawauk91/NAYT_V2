import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { toolsService } from '../services/apiService';
import { ChatMessage } from '../types';

interface GlobalChatBubbleProps {
  currentUsername: string;
}

export const GlobalChatBubble: React.FC<GlobalChatBubbleProps> = ({ currentUsername }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const normalizeAndSortMessages = (items: ChatMessage[]) => {
    const uniqueById = new Map<number, ChatMessage>();
    for (const msg of items) {
      uniqueById.set(msg.id, msg);
    }

    return [...uniqueById.values()].sort((a, b) => {
      const aTs = new Date(a.created_at || 0).getTime();
      const bTs = new Date(b.created_at || 0).getTime();
      if (aTs !== bTs) return aTs - bTs;
      return a.id - b.id;
    });
  };

  const sortedMessages = useMemo(() => {
    return normalizeAndSortMessages(messages);
  }, [messages]);

  useEffect(() => {
    const run = async () => {
      try {
        const history = await toolsService.getChatMessages(150);
        setMessages(normalizeAndSortMessages(history || []));
      } catch {
        // Ignore transient fetch errors, WS may still deliver messages.
      }
    };
    run();
  }, []);

  useEffect(() => {
    const wsUrl = toolsService.getChatWebSocketUrl();
    if (!wsUrl) return;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'history' && Array.isArray(payload.messages)) {
          setMessages((prev) => normalizeAndSortMessages([...prev, ...payload.messages]));
          return;
        }
        if (payload.type === 'message' && payload.message) {
          setMessages((prev) => normalizeAndSortMessages([...prev, payload.message]));
        }
      } catch {
        // Ignore malformed WS payloads.
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [sortedMessages, isOpen]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;

    setInput('');

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ message: text }));
      return;
    }

    try {
      const msg = await toolsService.sendChatMessage(text);
      setMessages((prev) => normalizeAndSortMessages([...prev, msg]));
    } catch {
      // If send fails, keep UX silent and let user retry.
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-[120] bg-violet-600 hover:bg-violet-700 text-white p-4 rounded-full shadow-2xl transition-all"
        title="General Team Chat"
      >
        {isOpen ? <X size={20} /> : <MessageCircle size={20} />}
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-6 z-[120] w-[360px] max-w-[calc(100vw-2rem)] h-[460px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">General Chat</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {connected ? 'Connected' : 'Reconnecting...'}
              </p>
            </div>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50 dark:bg-slate-950">
            {sortedMessages.map((m) => {
              const mine = m.username === currentUsername;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${mine ? 'bg-violet-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700'}`}>
                    <p className={`text-[11px] mb-1 ${mine ? 'text-violet-100' : 'text-slate-500 dark:text-slate-400'}`}>
                      {m.username}
                    </p>
                    <p className="break-words whitespace-pre-wrap">{m.message}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendMessage();
              }}
              placeholder="Write a message..."
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
            />
            <button
              onClick={sendMessage}
              className="bg-violet-600 hover:bg-violet-700 text-white px-3 rounded-lg transition-colors"
              title="Send"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
