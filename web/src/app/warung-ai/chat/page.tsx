"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bot, Send, Mic, ShoppingBag, TrendingUp, MessageCircle } from "lucide-react";
import { API_BASE } from "@/constants/api";

interface Evidence {
  label: string;
  value?: string;
  valueCents?: number;
  valuePct?: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  evidence?: Evidence[] | null;
}

const INITIAL_MESSAGE: Message = {
  id: "initial",
  role: "assistant",
  content: "Hai! Saya boleh bantu anda dengan insights jualan. Apa yang anda nak tahu? 😊",
  timestamp: new Date(),
};

const MERCHANT_ID = "1";

function formatEvidenceValue(e: Evidence) {
  if (typeof e.valueCents === "number") return `RM ${(e.valueCents / 100).toFixed(2)}`;
  if (typeof e.valuePct === "number") return `${e.valuePct.toFixed(1)}%`;
  return e.value ?? "";
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-MY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function todayLabel() {
  const d = new Date();
  const day = d.getDate();
  const month = d.toLocaleString("en-MY", { month: "short" });
  return `Today, ${day} ${month}`;
}

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chips, setChips] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/v1/chat/suggest-questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Merchant-Id": MERCHANT_ID },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { suggestedQuestions: string[] };
        if (cancelled) return;
        setChips(data.suggestedQuestions ?? []);
      } catch {
        // keep welcome screen usable even if suggestions fail
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Merchant-Id": MERCHANT_ID },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = (await res.json()) as {
        answer: string;
        evidence?: Evidence[];
      };
      if (!res.ok) throw new Error("chat request failed");
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.answer,
          timestamp: new Date(),
          evidence: data.evidence ?? null,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-err-${Date.now()}`,
          role: "assistant",
          content: "Maaf, ada masalah sambungan. Cuba lagi sebentar.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const showChips = messages.length === 1;

  return (
    <div className="flex flex-col h-screen max-w-[390px] mx-auto bg-[#F0F2F8]">
      {/* Status Bar */}
      <div className="flex items-center bg-white px-5 h-11 shrink-0">
        <span className="text-[15px] font-semibold text-black">9:41</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
            <path d="M8 2.4C10.4 2.4 12.5 3.4 14 5L15.3 3.7C13.4 1.9 10.8 0.8 8 0.8C5.2 0.8 2.6 1.9 0.7 3.7L2 5C3.5 3.4 5.6 2.4 8 2.4Z" fill="black" />
            <path d="M8 5.6C9.6 5.6 11 6.2 12.1 7.2L13.4 5.9C12 4.7 10.1 4 8 4C5.9 4 4 4.7 2.6 5.9L3.9 7.2C5 6.2 6.4 5.6 8 5.6Z" fill="black" />
            <circle cx="8" cy="10" r="1.6" fill="black" />
          </svg>
          <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
            <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="black" strokeOpacity="0.35" />
            <rect x="2" y="2" width="18" height="8" rx="2" fill="black" />
            <path d="M23 4V8C23.8 7.5 23.8 4.5 23 4Z" fill="black" fillOpacity="0.4" />
          </svg>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#E8EAED] w-full shrink-0" />

      {/* Header */}
      <div className="flex items-center justify-center bg-white h-14 px-4 shrink-0">
        <span className="text-[17px] font-bold text-[#1A1A2E] text-center">AI Assistant</span>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#E8EAED] w-full shrink-0" />

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {/* Date separator */}
        <div className="flex items-center gap-2 w-full">
          <div className="flex-1 h-px bg-[#CBD5E1]" />
          <span className="text-[11px] text-[#94A3B8]">{todayLabel()}</span>
          <div className="flex-1 h-px bg-[#CBD5E1]" />
        </div>

        {messages.map((msg) =>
          msg.role === "assistant" ? (
            <div key={msg.id} className="flex items-end gap-2 w-full">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#4F6FF0] shrink-0">
                <Bot size={16} color="white" />
              </div>
              <div className="flex-1 bg-white rounded-[16px_16px_16px_4px] px-[14px] py-3">
                <p className="text-[14px] text-[#1A1A2E] whitespace-pre-wrap">{msg.content}</p>
                {msg.evidence && msg.evidence.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[#E8EAED] flex flex-col gap-1">
                    {msg.evidence.map((e, i) => (
                      <div key={i} className="flex justify-between gap-2 text-[12px]">
                        <span className="text-[#64748B]">{e.label}</span>
                        <span className="text-[#1A1A2E] font-medium">{formatEvidenceValue(e)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div key={msg.id} className="flex flex-col items-end gap-1 w-full">
              <div className="bg-[#4F6FF0] rounded-[16px_16px_4px_16px] px-[14px] py-[10px]">
                <p className="text-[14px] text-white">{msg.content}</p>
              </div>
              <span className="text-[11px] text-[#94A3B8]">{formatTime(msg.timestamp)}</span>
            </div>
          )
        )}

        {/* Suggested chips — shown only before first user message */}
        {showChips && chips.length > 0 && (
          <div className="flex gap-2 w-full overflow-x-auto pb-1">
            {chips.map((chip) => (
              <button
                key={chip}
                onClick={() => sendMessage(chip)}
                className="shrink-0 px-3 py-[6px] bg-[#EEF2FF] rounded-[20px] text-[12px] text-[#4F6FF0]"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Loading dots */}
        {loading && (
          <div className="flex items-end gap-2 w-full">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#4F6FF0] shrink-0">
              <Bot size={16} color="white" />
            </div>
            <div className="bg-white rounded-[16px_16px_16px_4px] px-4 py-3 flex gap-1 items-center">
              <span className="w-2 h-2 rounded-full bg-[#94A3B8] animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 rounded-full bg-[#94A3B8] animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 rounded-full bg-[#94A3B8] animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Divider */}
      <div className="h-px bg-[#E2E8F0] w-full shrink-0" />

      {/* Input Bar */}
      <div className="flex items-center gap-3 bg-white h-[72px] px-4 shrink-0">
        <div className="flex-1 flex items-center gap-2 bg-[#F3F4F6] rounded-[22px] h-11 px-[14px]">
          <MessageCircle size={16} color="#9CA3AF" className="shrink-0" />
          <input
            type="text"
            placeholder="Ask anything..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-[14px] text-[#1A1A2E] placeholder-[#9CA3AF] outline-none min-w-0"
          />
        </div>
        <button className="flex items-center justify-center w-11 h-11 bg-[#F3F4F6] rounded-[22px] shrink-0">
          <Mic size={20} color="#6B7280" />
        </button>
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          className="flex items-center justify-center w-11 h-11 bg-[#4F6FF0] rounded-[22px] shrink-0 disabled:opacity-40"
        >
          <Send size={18} color="white" />
        </button>
      </div>

      {/* Bottom Nav */}
      <div className="flex bg-white h-16 border-t border-[#E8EAED] shrink-0">
        <button
          onClick={() => router.push("/warung-ai/pos")}
          className="flex-1 flex flex-col items-center justify-center gap-[3px]"
        >
          <ShoppingBag size={22} color="#9CA3AF" />
          <span className="text-[11px] text-[#9CA3AF]">POS</span>
        </button>
        <button className="flex-1 flex flex-col items-center justify-center gap-[3px]">
          <Bot size={22} color="#4F6FF0" />
          <span className="text-[11px] font-semibold text-[#4F6FF0]">Ask AI</span>
        </button>
        <button className="flex-1 flex flex-col items-center justify-center gap-[3px]">
          <TrendingUp size={22} color="#9CA3AF" />
          <span className="text-[11px] text-[#9CA3AF]">Analytics</span>
        </button>
      </div>
    </div>
  );
}
