import { useMemo, useState } from "react";
import Navbar from "./navbar";
import "./prompt.css";
import { PROMPTS } from "./PromptData";

function Prompt() {
    const [category, setCategory] = useState("All");
    const [search, setSearch] = useState("");
    const [copiedId, setCopiedId] = useState(null);

    const categories = useMemo(
        () => ["All", ...new Set(PROMPTS.map((p) => p.category))],
        []
    );

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        return PROMPTS.filter((p) => {
            if (category !== "All" && p.category !== category) return false;
            if (!term) return true;
            return [p.title, p.description, p.category, ...p.tags]
                .join(" ")
                .toLowerCase()
                .includes(term);
        });
    }, [category, search]);

    const copyPrompt = async (item) => {
        try {
            await navigator.clipboard.writeText(item.prompt);
        } catch {
            // fallback for browsers/contexts without the clipboard API
            const ta = document.createElement("textarea");
            ta.value = item.prompt;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
        }
        setCopiedId(item.id);
        setTimeout(() => setCopiedId((id) => (id === item.id ? null : id)), 1800);
    };

    return (
        <div className="prompt-container">
            <Navbar />

            <div className="prompt">
                <div className="prompt-header">
                    <h4>Prompt Library</h4>
                    <p className="prompt-count">
                        {visible.length} {visible.length === 1 ? "prompt" : "prompts"}
                    </p>
                    <input
                        type="search"
                        className="prompt-search"
                        placeholder="Search prompts..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search prompts"
                    />
                </div>

                <div className="prompt-tabs" role="tablist" aria-label="Categories">
                    {categories.map((c) => (
                        <button
                            key={c}
                            type="button"
                            role="tab"
                            aria-selected={category === c}
                            className={`prompt-tab ${category === c ? "is-active" : ""}`}
                            onClick={() => setCategory(c)}
                        >
                            {c}
                        </button>
                    ))}
                </div>

                {visible.length === 0 ? (
                    <div className="prompt-empty">
                        <h4>No prompts found</h4>
                        <p>Try a different search or category.</p>
                    </div>
                ) : (
                    <div className="prompt-grid">
                        {visible.map((p) => (
                            <article key={p.id} className="prompt-card">
                                <span className="prompt-badge">{p.category}</span>
                                <h5 className="prompt-card-title">{p.title}</h5>
                                <p className="prompt-card-text">{p.description}</p>

                                <div className="prompt-tags">
                                    {p.tags.map((t) => (
                                        <span key={t} className="prompt-tag">{t}</span>
                                    ))}
                                </div>

                                <div className="prompt-actions">
                                    <button
                                        type="button"
                                        className="prompt-copy"
                                        onClick={() => copyPrompt(p)}
                                    >
                                        {copiedId === p.id ? "Copied ✓" : "Copy prompt"}
                                    </button>
                                    <a
                                        className="prompt-link"
                                        href={p.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        View source
                                    </a>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default Prompt;