import { useRef, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import Navbar from "./navbar";
import "./Ai.css";
import HelloOrb from "./Helloorb";
import { model, fallbackModel } from "./firebase";

const SUGGESTIONS = [
    "Explain how React hooks work",
    "Help me write a README for my project",
    "Review my code and find bugs",
    "Plan my study week as a developer",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// errors worth retrying: Google busy, rate limited, or a timeout
const isBusy = (err) =>
    /\b(500|503|429)\b|high demand|overloaded|unavailable|timeout/i.test(String(err?.message || err));

function Ai() {
    const [messages, setMessages] = useState([]); // {role: 'user'|'model', text}
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(null);
    const chatRef = useRef(null);
    const bottomRef = useRef(null);
    const inputRef = useRef(null);

    // create the chat session once so Gemini remembers the conversation
    if (!chatRef.current) chatRef.current = model.startChat({ history: [] });

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages]);

    // grow the textarea with its content (up to the CSS max-height)
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
    }, [input]);

    function updateLastMessage(text) {
        setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: "model", text };
            return copy;
        });
    }

    // try the main model, retry once, then fall back to the backup model
    async function startStream(text) {
        try {
            return await chatRef.current.sendMessageStream(text);
        } catch (err) {
            if (!isBusy(err)) throw err;
        }

        await sleep(1000);
        try {
            return await chatRef.current.sendMessageStream(text);
        } catch (err) {
            if (!isBusy(err)) throw err;
        }

        const history = await chatRef.current.getHistory();
        chatRef.current = fallbackModel.startChat({ history });
        return await chatRef.current.sendMessageStream(text);
    }

    async function send(raw) {
        const text = raw.trim();
        if (!text || loading) return;

        setInput("");
        setLoading(true);
        setMessages((m) => [...m, { role: "user", text }, { role: "model", text: "" }]);

        try {
            const result = await startStream(text);
            let full = "";
            for await (const chunk of result.stream) {
                full += chunk.text();
                updateLastMessage(full);
            }

            // tell the user if the reply was cut off by the token limit
            try {
                const final = await result.response;
                if (final.candidates?.[0]?.finishReason === "MAX_TOKENS") {
                    updateLastMessage(full + "\n\n*(Reply was cut off. Type \"continue\" to get the rest.)*");
                }
            } catch {
                /* ignore, the reply is already shown */
            }
        } catch (err) {
            console.error("Gemini error:", err);

            const msg = String(err?.message || err);
            let friendly = "Something went wrong. Please try again.";

            if (msg.includes("App Check")) friendly = "App Check rejected the request (check enforcement in the Firebase console).";
            else if (/timeout/i.test(msg)) friendly = "The AI took too long to respond. Please try again.";
            else if (/\b(500|503)\b|high demand|overloaded/i.test(msg)) friendly = "The AI is busy right now. Please try again in a moment.";
            else if (msg.includes("403")) friendly = "Gemini access denied. Make sure AI Logic is set up in the Firebase console.";
            else if (msg.includes("404")) friendly = "Model not found. Try changing the model name in firebase.js.";
            else if (msg.includes("429")) friendly = "Rate limit reached. Wait a minute and try again.";

            updateLastMessage(import.meta.env.DEV ? `${friendly}\n\n\`${msg}\`` : friendly);
        } finally {
            setLoading(false);
        }
    }

    function handleKeyDown(e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send(input);
        }
    }

    function newChat() {
        if (loading) return;
        chatRef.current = model.startChat({ history: [] });
        setMessages([]);
        setInput("");
        inputRef.current?.focus();
    }

    async function copyMessage(text, index) {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(index);
            setTimeout(() => setCopied((c) => (c === index ? null : c)), 1500);
        } catch (err) {
            console.error(err);
        }
    }

    const isEmpty = messages.length === 0;

    return (
        <div className="ai-page">
            <Navbar />

            <div className="ai-main">
                <header className="ai-header">
                    <div className="ai-header-inner">
                        <h1 className="ai-title">AI Agent</h1>
                        {!isEmpty && (
                            <button type="button" className="ai-ghost" onClick={newChat} disabled={loading}>
                                + New chat
                            </button>
                        )}
                    </div>
                </header>

                <div className="ai-scroll">
                    {isEmpty ? (
                        <div className="ai-empty">
                            <HelloOrb size={180} />
                            <h2 className="ai-greeting">Hey, how can I help?</h2>
                            <p className="ai-greeting-sub">Ask a question, or start with one of these.</p>
                            <div className="ai-chips">
                                {SUGGESTIONS.map((s) => (
                                    <button key={s} type="button" className="ai-chip" onClick={() => send(s)}>
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="ai-thread" role="log" aria-live="polite">
                            {messages.map((m, i) => {
                                const streaming = loading && i === messages.length - 1;
                                return (
                                    <div key={i} className={`ai-msg ${m.role}`}>
                                        {m.role === "model" && (
                                            <span className="ai-avatar" aria-hidden="true">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2z" />
                                                </svg>
                                            </span>
                                        )}

                                        <div className="ai-body">
                                            {m.role === "user" ? (
                                                <div className="ai-bubble">{m.text}</div>
                                            ) : m.text ? (
                                                <>
                                                    <div className="ai-md">
                                                        <ReactMarkdown>{m.text}</ReactMarkdown>
                                                    </div>
                                                    {!streaming && (
                                                        <button type="button" className="ai-copy" onClick={() => copyMessage(m.text, i)}>
                                                            {copied === i ? "Copied" : "Copy"}
                                                        </button>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="ai-typing" aria-label="Thinking">
                                                    <i /><i /><i />
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={bottomRef} />
                        </div>
                    )}
                </div>

                <div className="ai-composer-wrap">
                    <div className="ai-composer">
                        <textarea
                            ref={inputRef}
                            rows={1}
                            placeholder="Ask anything"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            aria-label="Message"
                        />
                        <button
                            type="button"
                            className="ai-send"
                            aria-label="Send"
                            onClick={() => send(input)}
                            disabled={loading || !input.trim()}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 19V5M5 12l7-7 7 7" />
                            </svg>
                        </button>
                    </div>
                    <p className="ai-hint">Enter to send, Shift+Enter for a new line</p>
                </div>
            </div>
        </div>
    );
}

export default Ai;