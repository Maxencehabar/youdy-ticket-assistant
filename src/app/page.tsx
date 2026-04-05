"use client";

import { useChat } from "@ai-sdk/react";
import { useRef, useEffect, useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase-client";

function getTextFromParts(parts: any[]): string {
  if (!parts) return "";
  return parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("");
}

function getToolParts(parts: any[]): any[] {
  if (!parts) return [];
  return parts.filter((p: any) => p.type === "tool-invocation");
}

function getJiraResult(parts: any[]): { key: string; url: string } | null {
  if (!parts) return null;
  for (const p of parts) {
    if (p.type === "tool-invocation" && p.toolInvocation?.toolName === "createJiraTicket" && p.toolInvocation?.state === "result") {
      const result = p.toolInvocation.result;
      if (result?.success && result?.key && result?.url) return { key: result.key, url: result.url };
    }
  }
  return null;
}

const toolLabels: Record<string, string> = {
  queryCollection: "Recherche dans la base de donnees",
  getDocument: "Lecture d'un document",
  createJiraTicket: "Creation du ticket Jira",
};

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      onLogin();
    } catch {
      setError("Email ou mot de passe incorrect");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#F7F8FA]">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#146673] rounded-2xl flex items-center justify-center mb-4">
            <span className="text-3xl text-white font-bold">Y</span>
          </div>
          <h1 className="text-2xl font-semibold text-[#146673]">Youdy Tickets</h1>
          <p className="text-gray-500 mt-1">Connecte-toi pour creer des tickets</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ton@email.com"
              className="w-full px-4 py-3 bg-[#F7F8FA] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#146673]/30 focus:border-[#146673] text-gray-800"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-[#F7F8FA] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#146673]/30 focus:border-[#146673] text-gray-800"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#146673] text-white rounded-xl font-medium hover:bg-[#11525C] disabled:opacity-50 transition-all"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const t = await u.getIdToken();
        setToken(t);
      } else {
        setToken(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Refresh token periodically (Firebase tokens expire after 1h)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      const t = await user.getIdToken(true);
      setToken(t);
    }, 50 * 60 * 1000); // every 50 min
    return () => clearInterval(interval);
  }, [user]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F7F8FA]">
        <div className="w-8 h-8 border-3 border-[#146673] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !token) {
    return <LoginScreen onLogin={() => {}} />;
  }

  return <ChatScreen user={user} token={token} />;
}

function ChatScreen({ user, token }: { user: User; token: string }) {
  const { messages, sendMessage, status, setMessages } = useChat({
    experimental_throttle: 100,
    transport: {
      sendMessages: async ({ messages: msgs, abortSignal }: { messages: any; abortSignal?: AbortSignal }) => {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ messages: msgs }),
          signal: abortSignal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!res.body) throw new Error("No body");
        return res.body;
      },
    },
  } as any);
  const [input, setInput] = useState("");
  const isLoading = status === "streaming" || status === "submitted";
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createdTicket = useMemo(() => {
    for (const m of messages) {
      const result = getJiraResult(m.parts);
      if (result) return result;
    }
    return null;
  }, [messages]);

  const lastAssistantText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return getTextFromParts(messages[i].parts);
    }
    return "";
  }, [messages]);

  const showCreateButton = !isLoading && !createdTicket && lastAssistantText.includes("**Titre**") && lastAssistantText.includes("**Priorit");

  const suggestions = [
    { icon: "🗓", text: "Un client n'arrive pas a reserver" },
    { icon: "💰", text: "Un apprenti ne recoit pas ses paiements" },
    { icon: "📊", text: "Le recap mensuel a des donnees manquantes" },
    { icon: "🔍", text: "Un service n'apparait plus dans la recherche" },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#F7F8FA]">
      <header className="bg-[#146673] px-6 py-4 flex items-center gap-4 shadow-md">
        <div className="w-11 h-11 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white tracking-tight">Youdy Ticket Assistant</h1>
          <p className="text-sm text-white/70">Connecte en tant que {user.email}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {messages.length > 0 && (
            <button onClick={() => setMessages([])} className="text-xs text-white/70 hover:text-white bg-white/10 px-3 py-1.5 rounded-lg transition-all hover:bg-white/20">
              Nouveau ticket
            </button>
          )}
          <button onClick={() => signOut(auth)} className="text-xs text-white/70 hover:text-white bg-white/10 px-3 py-1.5 rounded-lg transition-all hover:bg-white/20">
            Deconnexion
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center mt-16 px-4">
              <div className="w-20 h-20 bg-[#D9EAE3] rounded-2xl flex items-center justify-center mb-6">
                <span className="text-4xl">🎫</span>
              </div>
              <h2 className="text-2xl font-semibold text-[#146673] mb-2">
                Salut {user.displayName || user.email?.split("@")[0]} !
              </h2>
              <p className="text-gray-500 text-center max-w-md mb-8">
                Decris-moi le probleme et je vais chercher les infos dans la base de donnees pour creer un ticket Jira bien structure.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                {suggestions.map((s) => (
                  <button key={s.text} onClick={() => setInput(s.text)} className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-[#146673] hover:shadow-sm transition-all text-left group">
                    <span className="text-xl group-hover:scale-110 transition-transform">{s.icon}</span>
                    <span className="text-sm text-gray-600 group-hover:text-[#146673]">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            const text = getTextFromParts(m.parts);
            const tools = getToolParts(m.parts);
            const jiraResult = getJiraResult(m.parts);

            if (jiraResult) {
              return (
                <div key={m.id} className="space-y-3">
                  {text && (
                    <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-md px-5 py-4 max-w-[85%] text-gray-800 leading-relaxed shadow-sm prose prose-sm prose-gray">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                    </div>
                  )}
                  <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl px-6 py-5 max-w-sm shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </div>
                      <div>
                        <p className="font-semibold text-emerald-800">Ticket cree !</p>
                        <p className="text-sm text-emerald-600">{jiraResult.key}</p>
                      </div>
                    </div>
                    <a href={jiraResult.url} target="_blank" rel="noopener noreferrer" className="block w-full text-center bg-emerald-500 text-white py-2.5 rounded-xl font-medium hover:bg-emerald-600 transition-all">
                      Voir sur Jira
                    </a>
                  </div>
                </div>
              );
            }

            if (m.role === "assistant" && tools.length > 0) {
              return (
                <div key={m.id} className="space-y-2">
                  {tools.map((tp: any, i: number) => {
                    const name = tp.toolInvocation?.toolName;
                    const done = tp.toolInvocation?.state === "result";
                    return (
                      <div key={i} className="flex items-center gap-2.5 text-sm text-gray-500 bg-[#D9EAE3]/40 rounded-lg px-3 py-2 w-fit">
                        {done ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#146673" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        ) : (
                          <span className="w-3 h-3 border-2 border-[#146673] border-t-transparent rounded-full animate-spin" />
                        )}
                        <span className={done ? "text-[#146673]" : ""}>{toolLabels[name] || name}</span>
                      </div>
                    );
                  })}
                  {text && (
                    <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-md px-5 py-4 max-w-[85%] text-gray-800 leading-relaxed shadow-sm prose prose-sm prose-gray">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                    </div>
                  )}
                </div>
              );
            }

            if (!text) return null;
            return (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`rounded-2xl px-5 py-3.5 max-w-[85%] leading-relaxed ${m.role === "user" ? "bg-[#146673] text-white rounded-tr-md shadow-md" : "bg-white border border-gray-200 text-gray-800 rounded-tl-md shadow-sm prose prose-sm prose-gray"}`}>
                  {m.role === "user" ? text : <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>}
                </div>
              </div>
            );
          })}

          {showCreateButton && (
            <div className="flex gap-3">
              <button onClick={() => sendMessage({ text: "Crée le ticket Jira" })} className="flex items-center gap-2 px-5 py-3 bg-[#146673] text-white rounded-xl font-medium hover:bg-[#11525C] transition-all shadow-md active:scale-[0.98]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                Creer le ticket Jira
              </button>
              <button onClick={() => sendMessage({ text: "Non, modifie le ticket" })} className="px-5 py-3 border border-gray-300 text-gray-600 rounded-xl hover:bg-gray-50 transition-all">
                Modifier
              </button>
            </div>
          )}

          {createdTicket && !isLoading && (
            <div className="flex justify-center pt-4">
              <button onClick={() => setMessages([])} className="flex items-center gap-2 px-6 py-3 bg-[#D9EAE3] text-[#146673] rounded-xl font-medium hover:bg-[#c5ddd4] transition-all">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                Nouveau ticket
              </button>
            </div>
          )}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-md px-5 py-4 shadow-sm">
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 bg-[#146673]/30 rounded-full animate-bounce" />
                  <span className="w-2.5 h-2.5 bg-[#146673]/30 rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} />
                  <span className="w-2.5 h-2.5 bg-[#146673]/30 rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t border-gray-200 bg-white px-4 py-4">
        <form onSubmit={(e) => { e.preventDefault(); if (!input?.trim()) return; sendMessage({ text: input }); setInput(""); }} className="max-w-3xl mx-auto flex gap-3">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Decris le probleme..." className="flex-1 px-5 py-3.5 bg-[#F7F8FA] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#146673]/30 focus:border-[#146673] text-gray-800 placeholder:text-gray-400 transition-all" disabled={isLoading} />
          <button type="submit" disabled={isLoading || !input?.trim()} className="px-6 py-3.5 bg-[#146673] text-white rounded-xl font-medium hover:bg-[#11525C] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md active:scale-[0.98]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </form>
      </div>
    </div>
  );
}
