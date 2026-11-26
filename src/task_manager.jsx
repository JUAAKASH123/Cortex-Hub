import { useEffect, useMemo, useState } from "react";
import Navbar from "./navbar";
import "./task_manager.css";
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

const COLUMNS = [
    { id: "todo", label: "To do" },
    { id: "doing", label: "In progress" },
    { id: "done", label: "Done" },
];

const PRIORITIES = [
    { id: "high", label: "High" },
    { id: "medium", label: "Medium" },
    { id: "low", label: "Low" },
];
const RANK = { high: 0, medium: 1, low: 2 };

// ---- date helpers (due dates are stored as "YYYY-MM-DD") ----
const toStr = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const formatDue = (str) => {
    if (!str) return null;
    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);
    if (str === toStr(now)) return "Today";
    if (str === toStr(tomorrow)) return "Tomorrow";
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
    });
};

function CheckIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
                d="M5 12.5l4.5 4.5L19 7.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function Task() {
    const { user } = useAuth();

    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [draft, setDraft] = useState(null);
    const [search, setSearch] = useState("");
    const [priorityFilter, setPriorityFilter] = useState("all");
    const [dragId, setDragId] = useState(null);
    const [overCol, setOverCol] = useState(null);

    const closeModal = () => setDraft(null);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape") setDraft(null);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // live tasks from Firestore
    useEffect(() => {
        if (!user) {
            setTasks([]);
            setLoading(false);
            return;
        }
        const q = query(
            collection(db, "users", user.uid, "tasks"),
            orderBy("createdAt", "desc")
        );
        const unsubscribe = onSnapshot(
            q,
            (snap) => {
                setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
                setLoading(false);
            },
            (error) => {
                console.error("Failed to load tasks:", error);
                setLoading(false);
            }
        );
        return () => unsubscribe();
    }, [user]);

    const today = toStr(new Date());
    const isOverdue = (t) => t.status !== "done" && t.dueDate && t.dueDate < today;

    // ---- stats (always from all tasks) ----
    const stats = useMemo(() => {
        const done = tasks.filter((t) => t.status === "done").length;
        return {
            total: tasks.length,
            doing: tasks.filter((t) => t.status === "doing").length,
            done,
            overdue: tasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < today).length,
            percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
        };
    }, [tasks, today]);

    // ---- filtered tasks grouped by column ----
    const columns = useMemo(() => {
        const term = search.trim().toLowerCase();
        const shown = tasks.filter((t) => {
            if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
            if (!term) return true;
            return `${t.title} ${t.description || ""}`.toLowerCase().includes(term);
        });
        return COLUMNS.map((c) => ({
            ...c,
            // high priority first, newest first inside the same priority
            items: shown
                .filter((t) => (t.status || "todo") === c.id)
                .sort((a, b) => (RANK[a.priority] ?? 1) - (RANK[b.priority] ?? 1)),
        }));
    }, [tasks, search, priorityFilter]);

    // ---- actions ----
    const openNew = (status = "todo") =>
        setDraft({ id: null, title: "", description: "", priority: "medium", dueDate: "", status });

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!user || saving || !draft) return;

        const data = {
            title: draft.title.trim(),
            description: draft.description.trim(),
            priority: draft.priority,
            dueDate: draft.dueDate || "",
            status: draft.status,
        };

        setSaving(true);
        try {
            if (draft.id) {
                await updateDoc(doc(db, "users", user.uid, "tasks", draft.id), {
                    ...data,
                    updatedAt: serverTimestamp(),
                });
            } else {
                await addDoc(collection(db, "users", user.uid, "tasks"), {
                    ...data,
                    createdAt: serverTimestamp(),
                });
            }
            closeModal();
        } catch (error) {
            console.error("Failed to save task:", error);
            alert("Could not save the task. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!user || !draft?.id) return;
        if (!window.confirm("Delete this task?")) return;
        try {
            await deleteDoc(doc(db, "users", user.uid, "tasks", draft.id));
            closeModal();
        } catch (error) {
            console.error("Failed to delete task:", error);
            alert("Could not delete the task. Please try again.");
        }
    };

    const setStatus = async (task, status) => {
        if (!user || (task.status || "todo") === status) return;
        try {
            await updateDoc(doc(db, "users", user.uid, "tasks", task.id), { status });
        } catch (error) {
            console.error("Failed to move task:", error);
        }
    };

    const toggleDone = (e, task) => {
        e.stopPropagation();
        setStatus(task, task.status === "done" ? "todo" : "done");
    };

    // ---- drag and drop ----
    const onDrop = (e, colId) => {
        e.preventDefault();
        const task = tasks.find((t) => t.id === dragId);
        setOverCol(null);
        setDragId(null);
        if (task) setStatus(task, colId);
    };

    const renderCard = (t) => {
        const due = formatDue(t.dueDate);
        const overdue = isOverdue(t);
        const priority = PRIORITIES.find((p) => p.id === t.priority) || PRIORITIES[1];
        return (
            <article
                key={t.id}
                className={`task-card ${t.status === "done" ? "is-done" : ""} ${dragId === t.id ? "is-dragging" : ""}`}
                draggable
                onDragStart={(e) => {
                    setDragId(t.id);
                    if (e.dataTransfer) {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", t.id); // needed by Firefox
                    }
                }}
                onDragEnd={() => {
                    setDragId(null);
                    setOverCol(null);
                }}
                onClick={() => setDraft({ ...t, status: t.status || "todo", dueDate: t.dueDate || "", description: t.description || "" })}
                onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        setDraft({ ...t, status: t.status || "todo", dueDate: t.dueDate || "", description: t.description || "" });
                    }
                }}
                tabIndex={0}
                aria-label={`Open task: ${t.title}`}
            >
                <div className="task-card-top">
                    <button
                        type="button"
                        className={`task-check ${t.status === "done" ? "is-checked" : ""}`}
                        onClick={(e) => toggleDone(e, t)}
                        aria-label={t.status === "done" ? "Mark as not done" : "Mark as done"}
                        aria-pressed={t.status === "done"}
                    >
                        <CheckIcon />
                    </button>
                    <h5 className="task-card-title">{t.title}</h5>
                </div>

                {t.description && <p className="task-card-text">{t.description}</p>}

                <div className="task-card-meta">
                    <span className={`task-badge ${priority.id}`}>{priority.label}</span>
                    {due && (
                        <span className={`task-due ${overdue ? "overdue" : ""}`}>
                            {overdue ? "Overdue · " : ""}
                            {due}
                        </span>
                    )}
                </div>

                <select
                    className="task-move"
                    value={t.status || "todo"}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setStatus(t, e.target.value)}
                    aria-label="Move task to"
                >
                    {COLUMNS.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                </select>
            </article>
        );
    };

    return (
        <div className="task-container">
            <Navbar />

            <div className="task">
                {/* header */}
                <div className="task-header">
                    <h5 className="task-heading">Task Manager</h5>
                    <p className="task-sub">
                        {stats.total} {stats.total === 1 ? "task" : "tasks"}
                    </p>
                    <button type="button" className="task-add" onClick={() => openNew("todo")}>
                        + Add task
                    </button>
                </div>

                {/* stats */}
                <div className="task-stats">
                    <div className="task-stat">
                        <span className="task-stat-label">In progress</span>
                        <span className="task-stat-value">{stats.doing}</span>
                    </div>
                    <div className="task-stat">
                        <span className="task-stat-label">Completed</span>
                        <span className="task-stat-value">{stats.done}</span>
                    </div>
                    <div className={`task-stat ${stats.overdue ? "is-alert" : ""}`}>
                        <span className="task-stat-label">Overdue</span>
                        <span className="task-stat-value">{stats.overdue}</span>
                    </div>
                    <div className="task-stat">
                        <span className="task-stat-label">Progress · {stats.percent}%</span>
                        <div className="task-progress" role="progressbar" aria-valuenow={stats.percent} aria-valuemin={0} aria-valuemax={100}>
                            <span style={{ width: `${stats.percent}%` }} />
                        </div>
                    </div>
                </div>

                {/* toolbar */}
                <div className="task-toolbar">
                    <input
                        type="search"
                        className="task-search"
                        placeholder="Search tasks..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search tasks"
                    />
                    <select
                        className="task-filter"
                        value={priorityFilter}
                        onChange={(e) => setPriorityFilter(e.target.value)}
                        aria-label="Filter by priority"
                    >
                        <option value="all">All priorities</option>
                        {PRIORITIES.map((p) => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                    </select>
                </div>

                {/* board */}
                {loading ? (
                    <div className="task-empty"><p>Loading tasks...</p></div>
                ) : (
                    <div className="task-board">
                        {columns.map((col) => (
                            <section
                                key={col.id}
                                className={`task-column col-${col.id} ${overCol === col.id ? "is-over" : ""}`}
                                aria-label={col.label}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    if (overCol !== col.id) setOverCol(col.id);
                                }}
                                onDragLeave={(e) => {
                                    if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(null);
                                }}
                                onDrop={(e) => onDrop(e, col.id)}
                            >
                                <div className="task-column-head">
                                    <span className="task-dot" />
                                    <h6>{col.label}</h6>
                                    <span className="task-column-count">{col.items.length}</span>
                                    <button
                                        type="button"
                                        className="task-column-add"
                                        onClick={() => openNew(col.id)}
                                        aria-label={`Add task to ${col.label}`}
                                    >
                                        +
                                    </button>
                                </div>

                                <div className="task-list">
                                    {col.items.length === 0 ? (
                                        <div className="task-column-empty">
                                            {tasks.length === 0 ? "No tasks yet" : "Nothing here"}
                                        </div>
                                    ) : (
                                        col.items.map(renderCard)
                                    )}
                                </div>
                            </section>
                        ))}
                    </div>
                )}

                {/* modal */}
                {draft && (
                    <div className="modal-overlay" onClick={closeModal}>
                        <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                            <h4>{draft.id ? "Edit task" : "New task"}</h4>
                            <form onSubmit={handleSubmit}>
                                <input
                                    type="text"
                                    placeholder="Task title"
                                    value={draft.title}
                                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                                    autoFocus
                                    required
                                />
                                <textarea
                                    placeholder="Add details (optional)"
                                    value={draft.description}
                                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                                    rows={4}
                                />

                                <div className="modal-row">
                                    <label>
                                        <span>Priority</span>
                                        <select
                                            value={draft.priority}
                                            onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
                                        >
                                            {PRIORITIES.map((p) => (
                                                <option key={p.id} value={p.id}>{p.label}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label>
                                        <span>Status</span>
                                        <select
                                            value={draft.status}
                                            onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                                        >
                                            {COLUMNS.map((c) => (
                                                <option key={c.id} value={c.id}>{c.label}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label>
                                        <span>Due date</span>
                                        <input
                                            type="date"
                                            value={draft.dueDate}
                                            onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
                                        />
                                    </label>
                                </div>

                                <div className="modal-actions">
                                    {draft.id && (
                                        <button type="button" className="btn-delete" onClick={handleDelete}>
                                            Delete
                                        </button>
                                    )}
                                    <span className="spacer" />
                                    <button type="button" className="btn-cancel" onClick={closeModal}>Cancel</button>
                                    <button type="submit" className="btn-save" disabled={saving}>
                                        {saving ? "Saving..." : draft.id ? "Save changes" : "Add task"}
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

export default Task;