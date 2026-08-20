"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Person {
  id: string;
  name: string;
}

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [personId, setPersonId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch("/api/people")
      .then((r) => r.json())
      .then((d) => {
        setPeople(d.people ?? []);
        if (d.people?.length) setPersonId(d.people[0].id);
      });
  }, []);

  async function createSession(pId: string): Promise<string> {
    const res = await fetch("/api/chat/sessions", {
      method: "POST",
      body: JSON.stringify({ person_id: pId }),
    });
    const { session } = await res.json();
    return session.id;
  }

  async function startSession(pId: string) {
    const id = await createSession(pId);
    setSessionId(id);
    setMessages([]);
  }

  useEffect(() => {
    if (!personId) return;
    let cancelled = false;
    createSession(personId).then((id) => {
      if (!cancelled) {
        setSessionId(id);
        setMessages([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  async function sendMessage() {
    if (!input.trim() || !sessionId || !personId) return;
    const question = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: question }]);
    setSending(true);

    const res = await fetch("/api/chat/message", {
      method: "POST",
      body: JSON.stringify({ person_id: personId, session_id: sessionId, message: question }),
    });
    const data = await res.json();
    setSending(false);

    if (res.ok) {
      setMessages((m) => [...m, { role: "assistant", content: data.answer }]);
    } else {
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${data.error}` }]);
    }
  }

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Ask about the history</h1>
        <Link href="/" className="text-sm text-neutral-600 hover:text-neutral-900">
          Back
        </Link>
      </div>

      <div className="mt-4 flex gap-3">
        <select
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => startSession(personId)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700"
        >
          New conversation
        </button>
      </div>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-lg border border-neutral-200 p-4">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-400">
            Ask things like &quot;How has the cholesterol trended?&quot; or &quot;Summarize everything from
            this year.&quot;
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === "user" ? "text-right" : "text-left"}`}>
            <span
              className={`inline-block max-w-[85%] rounded-lg px-3 py-2 ${
                m.role === "user" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-800"
              }`}
            >
              {m.content}
            </span>
          </div>
        ))}
        {sending && <p className="text-sm text-neutral-400">Thinking...</p>}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Ask a question..."
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          onClick={sendMessage}
          disabled={sending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
