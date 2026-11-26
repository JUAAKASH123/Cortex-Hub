import { useEffect, useMemo, useState } from "react";
import Navbar from "./navbar";
import "./Note.css";
import { db } from "./firebase";
import {
    addDoc,
    collection,
    onSnapshot,
    orderBy,
    query,
    deleteDoc,
    updateDoc,
    doc,
    serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "./AuthContext";

// Colour shades a note can have (styles are .tone-<id> in Note.css)
const COLORS = [
    { id: "white", label: "White" },
    { id: "rose", label: "Rose" },
    { id: "peach", label: "Peach" },
    { id: "orange", label: "Orange" },
    { id: "butter", label: "Yellow" },
    { id: "lime", label: "Lime" },
    { id: "mint", label: "Green" },
    { id: "teal", label: "Teal" },
    { id: "sky", label: "Sky" },
    { id: "blue", label: "Blue" },
    { id: "lavender", label: "Purple" },
    { id: "pink", label: "Pink" },
    { id: "grey", label: "Grey" },
];
const PICKABLE = COLORS.filter((c) => c.id !== "white");

// Notes saved before colours existed get a stable colour from their id
const colorOf = (note) => {
    if (note.color && COLORS.some((c) => c.id === note.color)) return note.color;
    let hash = 0;
    const id = note.id || "";
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return PICKABLE[hash % PICKABLE.length].id;
};

function StarIcon({ filled }) {
    return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
                d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"
                fill={filled ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function Note() {
    const { user } = useAuth();

    // draft = the note currently open in the modal (null = modal closed)
    // { id: null } means a brand new note, otherwise editing an existing one
    const [draft, setDraft] = useState(null);
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const closeModal = () => setDraft(null);

    // close modal with Escape
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === "Escape") setDraft(null);
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, []);

    // load notes live from Firestore
    useEffect(() => {
        if (!user) {
            setNotes([]);
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, "users", user.uid, "notes"),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                setNotes(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
                setLoading(false);
            },
            (error) => {
                console.error("Failed to load notes: ", error);
                setLoading(false);
            }
        );
        return () => unsubscribe();
    }, [user]);

    // starred notes first, newest first inside each group
    // (done here instead of in the query so no Firestore index is needed)
    const { starred, others } = useMemo(() => ({
        starred: notes.filter((n) => n.starred),
        others: notes.filter((n) => !n.starred),
    }), [notes]);

    // create or update
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!user || saving || !draft) return;

        const data = {
            title: draft.title.trim(),
            content: draft.content,
            starred: !!draft.starred,
            color: draft.color,
        };

        setSaving(true);
        try {
            if (draft.id) {
                await updateDoc(doc(db, "users", user.uid, "notes", draft.id), {
                    ...data,
                    updatedAt: serverTimestamp(),
                });
            } else {
                await addDoc(collection(db, "users", user.uid, "notes"), {
                    ...data,
                    createdAt: serverTimestamp(),
                });
            }
            closeModal();
        } catch (error) {
            console.error("Failed to save note: ", error);
            alert("Could not save the note. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!user || !draft?.id) return;
        if (!window.confirm("Delete this note?")) return;
        try {
            await deleteDoc(doc(db, "users", user.uid, "notes", draft.id));
            closeModal();
        } catch (error) {
            console.error("Failed to delete note:", error);
            alert("Could not delete the note. Please try again.");
        }
    };

    // star / unstar straight from the card
    const toggleStar = async (e, note) => {
        e.stopPropagation(); // don't open the editor
        try {
            await updateDoc(doc(db, "users", user.uid, "notes", note.id), {
                starred: !note.starred,
            });
        } catch (error) {
            console.error("Failed to update star:", error);
        }
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return "Just now";
        return timestamp.toDate().toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    };

    const renderCard = (note) => (
        <article
            key={note.id}
            className={`note-card tone-${colorOf(note)}`}
            onClick={() => setDraft({ ...note, color: colorOf(note) })}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDraft({ ...note, color: colorOf(note) });
                }
            }}
            tabIndex={0}
            role="button"
            aria-label={`Open note: ${note.title}`}
        >
            <div className="note-card-top">
                <h4 className="note-card-title">{note.title}</h4>
                <button
                    type="button"
                    className={`star-btn ${note.starred ? "is-starred" : ""}`}
                    onClick={(e) => toggleStar(e, note)}
                    aria-label={note.starred ? "Remove star" : "Star this note"}
                    aria-pressed={!!note.starred}
                >
                    <StarIcon filled={note.starred} />
                </button>
            </div>

            <p className="note-card-text">{note.content || "No content"}</p>

            <div className="note-card-footer">
                <span>{formatDate(note.createdAt)}</span>
            </div>
        </article>
    );

    return (
        <div className="note-container">
            <Navbar />

            <div className="note">
                <div className="note-title">
                    <h3>Notes</h3>
                    <p className="note-count">
                        {notes.length} {notes.length === 1 ? "note" : "notes"}
                    </p>
                    <button
                        type="button"
                        className="note-add"
                        onClick={() => setDraft({
                            id: null,
                            title: "",
                            content: "",
                            starred: false,
                            color: PICKABLE[Math.floor(Math.random() * PICKABLE.length)].id,
                        })}
                    >
                        + Add note
                    </button>
                </div>

                {loading ? (
                    <div className="note-empty"><p>Loading notes...</p></div>
                ) : notes.length === 0 ? (
                    <div className="note-empty">
                        <h4>No notes yet</h4>
                        <p>Tap “Add note” to write your first one.</p>
                    </div>
                ) : (
                    <>
                        {starred.length > 0 && (
                            <section>
                                <h5 className="note-section">Starred</h5>
                                <div className="note-grid">{starred.map(renderCard)}</div>
                            </section>
                        )}

                        {others.length > 0 && (
                            <section>
                                {starred.length > 0 && <h5 className="note-section">Other notes</h5>}
                                <div className="note-grid">{others.map(renderCard)}</div>
                            </section>
                        )}
                    </>
                )}

                {draft && (
                    <div className="modal-overlay" onClick={closeModal}>
                        <div
                            className="modal"
                            onClick={(e) => e.stopPropagation()}
                            role="dialog"
                            aria-modal="true"
                        >
                            <div className="modal-head">
                                <h4>{draft.id ? "Edit note" : "New note"}</h4>
                                <button
                                    type="button"
                                    className={`star-btn ${draft.starred ? "is-starred" : ""}`}
                                    onClick={() => setDraft({ ...draft, starred: !draft.starred })}
                                    aria-label={draft.starred ? "Remove star" : "Star this note"}
                                    aria-pressed={!!draft.starred}
                                >
                                    <StarIcon filled={draft.starred} />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit}>
                                <input
                                    type="text"
                                    placeholder="Title"
                                    value={draft.title}
                                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                                    autoFocus
                                    required
                                />
                                <textarea
                                    placeholder="Write your note..."
                                    value={draft.content}
                                    onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                                    rows={8}
                                />
                                <div className="color-row" role="radiogroup" aria-label="Note colour">
                                    {COLORS.map((c) => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={draft.color === c.id}
                                            aria-label={c.label}
                                            title={c.label}
                                            className={`swatch tone-${c.id} ${draft.color === c.id ? "is-selected" : ""}`}
                                            onClick={() => setDraft({ ...draft, color: c.id })}
                                        />
                                    ))}
                                </div>
                                <div className="modal-actions">
                                    {draft.id && (
                                        <button type="button" className="btn-delete" onClick={handleDelete}>
                                            Delete
                                        </button>
                                    )}
                                    <span className="spacer" />
                                    <button type="button" className="btn-cancel" onClick={closeModal}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn-save" disabled={saving}>
                                        {saving ? "Saving..." : draft.id ? "Save changes" : "Save note"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Note;