import { useState, useRef, useEffect } from "react";
import { trpcParseResponse, trpcSerializeWire } from "../lib/trpc-wire";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function ChatWidget({ orgId }: { orgId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "হ্যালো! আমি Skynity সাপোর্ট। কিভাবে সাহায্য করতে পারি?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/trpc/ai.chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: trpcSerializeWire({
          orgId,
          message: userMsg,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      const parsed = trpcParseResponse<{ reply: string }>(data);
      setMessages((prev) => [...prev, { role: "assistant", content: parsed.reply }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "দুঃখিত, এখন সাপোর্ট unavailable। পরে চেষ্টা করুন।" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg transition-all"
        >
          💬 সাপোর্ট
        </button>
      )}

      {isOpen && (
        <div className="bg-white rounded-lg shadow-xl w-80 h-96 flex flex-col border border-gray-200">
          {/* Header */}
          <div className="bg-blue-600 text-white p-3 rounded-t-lg flex justify-between items-center">
            <span className="font-semibold">🤖 Skynity Support</span>
            <button onClick={() => setIsOpen(false)} className="text-white hover:text-gray-200">
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`p-2 rounded-lg max-w-[85%] ${
                  msg.role === "user"
                    ? "bg-blue-100 ml-auto text-right"
                    : "bg-gray-100 mr-auto"
                }`}
              >
                {msg.content}
              </div>
            ))}
            {loading && (
              <div className="bg-gray-100 p-2 rounded-lg max-w-[85%]">
                <span className="animate-pulse">টাইপ করছে...</span>
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-200 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="মেসেজ লিখুন..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={sendMessage}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              পাঠান
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
