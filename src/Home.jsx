import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
    addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc,
} from 'firebase/firestore'
import { db } from './firebase'
import { useAuth } from './AuthContext'
import Navbar from './navbar'
import GithubActivity from './GithubActivity'
import './home.css'

/* ---------- helpers ---------- */
const toStr = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const formatDue = (str) => {
    if (!str) return ''
    const now = new Date()
    const tomorrow = new Date()
    tomorrow.setDate(now.getDate() + 1)
    if (str === toStr(now)) return 'Today'
    if (str === toStr(tomorrow)) return 'Tomorrow'
    const [y, m, d] = str.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

const RANK = { high: 0, medium: 1, low: 2 }
const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' }

const timeAgo = (ts) => {
    if (!ts?.toDate) return 'now'
    const mins = Math.floor((Date.now() - ts.toDate().getTime()) / 60000)
    if (mins < 1) return 'now'
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}d`
    return ts.toDate().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

const PAGES = [
    { to: '/Home', label: 'Dashboard', hint: 'Overview' },
    { to: '/Ai', label: 'Ai Agent', hint: 'Ask anything' },
    { to: '/Task', label: 'Task Manager', hint: 'Kanban board' },
    { to: '/Note', label: 'Note', hint: 'Your notes' },
    { to: '/Prompt', label: 'Prompt Library', hint: 'Saved prompts' },
    { to: '/FileManager', label: 'File Manager', hint: 'Browse repositories' },
]

/* ---------- command palette (Ctrl/Cmd + K) ---------- */
function CommandPalette({ open, onClose, tasks, notes }) {
    const navigate = useNavigate()
    const [q, setQ] = useState('')
    const [index, setIndex] = useState(0)
    const listRef = useRef(null)

    useEffect(() => {
        if (!open) return
        setQ('')
        setIndex(0)
        const trigger = document.activeElement
        return () => trigger?.focus?.()
    }, [open])
    useEffect(() => setIndex(0), [q])

    const results = useMemo(() => {
        const term = q.trim().toLowerCase()
        const pages = PAGES
            .filter((p) => !term || p.label.toLowerCase().includes(term))
            .map((p) => ({ id: `p-${p.to}`, group: 'Pages', label: p.label, hint: p.hint, to: p.to }))
        if (!term) return pages
        const taskHits = tasks
            .filter((t) => `${t.title} ${t.description || ''}`.toLowerCase().includes(term))
            .slice(0, 5)
            .map((t) => ({ id: `t-${t.id}`, group: 'Tasks', label: t.title, hint: t.status === 'done' ? 'Done' : formatDue(t.dueDate) || 'No due date', to: '/Task' }))
        const noteHits = notes
            .filter((n) => `${n.title} ${n.content || ''}`.toLowerCase().includes(term))
            .slice(0, 5)
            .map((n) => ({ id: `n-${n.id}`, group: 'Notes', label: n.title, hint: timeAgo(n.createdAt), to: '/Note' }))
        return [...pages, ...taskHits, ...noteHits]
    }, [q, tasks, notes])

    useEffect(() => {
        listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
    }, [index, results])

    if (!open) return null

    const go = (item) => { if (!item) return; onClose(); navigate(item.to) }

    const onKeyDown = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => (results.length ? (i + 1) % results.length : 0)) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0)) }
        else if (e.key === 'Enter') { e.preventDefault(); go(results[index]) }
        else if (e.key === 'Escape') onClose()
    }

    let lastGroup = null
    return (
        <div className="cmd-overlay" onClick={onClose}>
            <div className="cmd" role="dialog" aria-modal="true" aria-label="Search" onClick={(e) => e.stopPropagation()}>
                <input
                    className="cmd-input"
                    autoFocus
                    type="text"
                    placeholder="Search tasks, notes and pages"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={onKeyDown}
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="cmd-list"
                    aria-activedescendant={results[index] ? `cmd-opt-${results[index].id}` : undefined}
                    aria-label="Search"
                />
                <ul className="cmd-list" id="cmd-list" role="listbox" ref={listRef}>
                    {results.length === 0 && <li className="cmd-empty" role="presentation">No results for “{q}”. Try a task title or a page name.</li>}
                    {results.map((r, i) => {
                        const header = r.group !== lastGroup
                        lastGroup = r.group
                        return (
                            <li key={r.id} role="presentation">
                                {header && <span className="cmd-group">{r.group}</span>}
                                <button
                                    type="button"
                                    id={`cmd-opt-${r.id}`}
                                    tabIndex={-1}
                                    role="option"
                                    aria-selected={i === index}
                                    className={`cmd-item ${i === index ? 'is-active' : ''}`}
                                    onMouseMove={() => setIndex(i)}
                                    onClick={() => go(r)}
                                >
                                    <span className="cmd-item-label">{r.label}</span>
                                    <span className="cmd-item-hint">{r.hint}</span>
                                </button>
                            </li>
                        )
                    })}
                </ul>
            </div>
        </div>
    )
}

/* ---------- page ---------- */
function Home() {
    const { user } = useAuth()
    const name = (user?.displayName || 'there').split(' ')[0]

    const [tasks, setTasks] = useState([])
    const [notes, setNotes] = useState([])
    const [loadingTasks, setLoadingTasks] = useState(true)
    const [loadingNotes, setLoadingNotes] = useState(true)
    const [quickTitle, setQuickTitle] = useState('')
    const [adding, setAdding] = useState(false)
    const [paletteOpen, setPaletteOpen] = useState(false)
    const [tasksError, setTasksError] = useState(false)
    const [notesError, setNotesError] = useState(false)
    const [tasksTry, setTasksTry] = useState(0)
    const [notesTry, setNotesTry] = useState(0)
    const [actionError, setActionError] = useState('')
    const [toast, setToast] = useState(null)
    const [chartAsTable, setChartAsTable] = useState(false)
    const headingRef = useRef(null)
    const toastTimer = useRef(null)

    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

    const startToastTimer = () => {
        clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(null), 10000)
    }
    const pauseToastTimer = () => clearTimeout(toastTimer.current)
    const showToast = (text, undo) => {
        setToast({ text, undo, id: Date.now() })
        startToastTimer()
    }
    useEffect(() => () => clearTimeout(toastTimer.current), [])

    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault()
                setPaletteOpen((o) => !o)
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    useEffect(() => {
        if (!user) { setTasks([]); setLoadingTasks(false); return }
        setLoadingTasks(true)
        setTasksError(false)
        const q = query(collection(db, 'users', user.uid, 'tasks'), orderBy('createdAt', 'desc'))
        return onSnapshot(q,
            (snap) => { setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setTasksError(false); setLoadingTasks(false) },
            (err) => { console.error('Failed to load tasks:', err); setTasksError(true); setLoadingTasks(false) })
    }, [user, tasksTry])

    useEffect(() => {
        if (!user) { setNotes([]); setLoadingNotes(false); return }
        setLoadingNotes(true)
        setNotesError(false)
        const q = query(collection(db, 'users', user.uid, 'notes'), orderBy('createdAt', 'desc'))
        return onSnapshot(q,
            (snap) => { setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setNotesError(false); setLoadingNotes(false) },
            (err) => { console.error('Failed to load notes:', err); setNotesError(true); setLoadingNotes(false) })
    }, [user, notesTry])

    const today = toStr(new Date())

    const stats = useMemo(() => {
        const status = (t) => t.status || 'todo'
        const open = tasks.filter((t) => status(t) !== 'done')
        const doing = tasks.filter((t) => status(t) === 'doing').length
        const done = tasks.length - open.length
        return {
            total: tasks.length,
            todo: open.length - doing,
            doing,
            done,
            open: open.length,
            overdue: open.filter((t) => t.dueDate && t.dueDate < today).length,
            priority: {
                high: open.filter((t) => t.priority === 'high').length,
                medium: open.filter((t) => (t.priority || 'medium') === 'medium').length,
                low: open.filter((t) => t.priority === 'low').length,
            },
        }
    }, [tasks, today])

    const week = useMemo(() => {
        const days = []
        for (let i = 0; i < 7; i++) {
            const d = new Date()
            d.setDate(d.getDate() + i)
            const key = toStr(d)
            days.push({
                key,
                isToday: i === 0,
                name: d.toLocaleDateString(undefined, { weekday: 'short' }),
                num: d.getDate(),
                count: tasks.filter((t) => (t.status || 'todo') !== 'done' && t.dueDate === key).length,
            })
        }
        return days
    }, [tasks])
    const weekTotal = week.reduce((s, d) => s + d.count, 0)

    const activity = useMemo(() => {
        const days = []
        for (let i = 6; i >= 0; i--) {
            const d = new Date()
            d.setDate(d.getDate() - i)
            const key = toStr(d)
            const on = (item) => item.createdAt?.toDate && toStr(item.createdAt.toDate()) === key
            days.push({
                key,
                label: d.toLocaleDateString(undefined, { weekday: 'short' }),
                full: d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }),
                tasks: tasks.filter(on).length,
                notes: notes.filter(on).length,
            })
        }
        const max = Math.max(1, ...days.map((d) => Math.max(d.tasks, d.notes)))
        return {
            days, max,
            totalTasks: days.reduce((s, d) => s + d.tasks, 0),
            totalNotes: days.reduce((s, d) => s + d.notes, 0),
        }
    }, [tasks, notes])

    const attention = useMemo(() => {
        const status = (t) => t.status || 'todo'
        return tasks
            .filter((t) => status(t) !== 'done' && (status(t) === 'doing' || (t.dueDate && t.dueDate <= today)))
            .sort((a, b) => {
                const da = a.dueDate || '9999-99-99'
                const dbb = b.dueDate || '9999-99-99'
                if (da !== dbb) return da < dbb ? -1 : 1
                return (RANK[a.priority] ?? 1) - (RANK[b.priority] ?? 1)
            })
    }, [tasks, today])
    const focus = attention.slice(0, 8)

    const starredCount = useMemo(() => notes.filter((n) => n.starred).length, [notes])
    const recentNotes = useMemo(() => {
        const starred = notes.filter((n) => n.starred)
        const rest = notes.filter((n) => !n.starred)
        return [...starred, ...rest].slice(0, 5)
    }, [notes])

    const setStatus = (id, status) =>
        updateDoc(doc(db, 'users', user.uid, 'tasks', id), { status, updatedAt: serverTimestamp() })

    const markDone = async (task) => {
        const previous = task.status || 'todo'
        setActionError('')
        try {
            await setStatus(task.id, 'done')
            showToast(`Marked “${task.title}” as done`, async () => {
                try { await setStatus(task.id, previous) }
                catch (err) { console.error(err); setActionError('Could not undo. The task is still marked as done.') }
            })
            headingRef.current?.focus()
        } catch (err) {
            console.error('Failed to complete task:', err)
            setActionError(`Could not mark “${task.title}” as done. Your tasks are unchanged. Try again.`)
        }
    }

    const quickAdd = async (e) => {
        e.preventDefault()
        const title = quickTitle.trim()
        if (!title || !user || adding) return
        setAdding(true)
        setActionError('')
        try {
            const ref = await addDoc(collection(db, 'users', user.uid, 'tasks'), {
                title, description: '', priority: 'medium', dueDate: '', status: 'todo',
                createdAt: serverTimestamp(),
            })
            setQuickTitle('')
            showToast(`Added “${title}”`, async () => {
                try { await deleteDoc(ref) }
                catch (err) { console.error(err); setActionError('Could not undo. The task was kept.') }
            })
        } catch (err) {
            console.error('Failed to add task:', err)
            setActionError('Could not add the task. What you typed is kept. Try again.')
        } finally {
            setAdding(false)
        }
    }

    const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
    const pct = (n) => (stats.total ? `${(n / stats.total) * 100}%` : '0%')

    const cells = [
        { label: 'Open tasks', value: stats.open, note: `${stats.total} in total`, loading: loadingTasks, error: tasksError, to: '/Task' },
        { label: 'Due in 7 days', value: weekTotal, note: weekTotal ? 'including today' : 'nothing scheduled', loading: loadingTasks, error: tasksError, to: '/Task' },
        { label: 'Overdue', value: stats.overdue, note: stats.overdue ? 'past their due date' : 'none', loading: loadingTasks, error: tasksError, alert: stats.overdue > 0, to: '/Task' },
        { label: 'Notes', value: notes.length, note: `${starredCount} starred`, loading: loadingNotes, error: notesError, to: '/Note' },
    ]

    return (
        <div className="d-page">
            <Navbar />

            <main className="d">
                <header className="d-head">
                    <div>
                        <h1>{name}’s workspace</h1>
                        <p>{dateLabel}</p>
                    </div>
                    <div className="d-head-actions">
                        <button type="button" className="d-search" onClick={() => setPaletteOpen(true)} aria-label="Search">
                            <span>Search</span>
                            <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
                        </button>
                        <Link to="/Note" className="d-btn">New note</Link>
                        <Link to="/Task" className="d-btn d-btn-solid">Open board</Link>
                    </div>
                </header>

                {/* stat strip: one bordered row, not four cards */}
                <section className="d-strip" aria-label="Overview">
                    {cells.map((c) => (
                        <Link key={c.label} to={c.to} className={`d-cell ${c.alert ? 'is-alert' : ''}`}>
                            <span className="d-cell-label">{c.label}</span>
                            <span className="d-cell-value">{c.loading || c.error ? '-' : c.value}</span>
                            <span className="d-cell-note">{c.loading ? 'Loading' : c.error ? 'Not loaded' : c.note}</span>
                        </Link>
                    ))}
                    <div className="d-cell d-cell-progress">
                        <span className="d-cell-label">Completion</span>
                        <div className="d-seg" role="img" aria-label={`${stats.done} done, ${stats.doing} in progress, ${stats.todo} to do`}>
                            <i className="seg-done" style={{ width: pct(stats.done) }} />
                            <i className="seg-doing" style={{ width: pct(stats.doing) }} />
                        </div>
                        <span className="d-cell-note">
                            {loadingTasks ? 'Loading' : tasksError ? 'Not loaded' : `${stats.done} done, ${stats.doing} in progress, ${stats.todo} to do`}
                        </span>
                    </div>
                </section>

                <div className="d-grid">
                    <div className="d-col">
                        {/* tasks */}
                        <section className="d-panel">
                            <div className="d-panel-head">
                                <h2 ref={headingRef} tabIndex={-1}>Needs attention</h2>
                                <span className="d-meta">
                                    {!loadingTasks && !tasksError && attention.length > 0 && `Showing ${focus.length} of ${attention.length}`}
                                    {' '}<Link to="/Task">All tasks</Link>
                                </span>
                            </div>

                            {tasksError ? (
                                <p className="d-error" role="status">
                                    Could not load your tasks. Check your connection.{' '}
                                    <button type="button" onClick={() => setTasksTry((n) => n + 1)}>Reload tasks</button>
                                </p>
                            ) : loadingTasks ? (
                                <ul className="d-list" aria-busy="true" aria-label="Loading tasks">
                                    {[0, 1, 2].map((i) => <li key={i} className="d-skel" />)}
                                </ul>
                            ) : focus.length === 0 ? (
                                <p className="d-empty">Tasks that are overdue, due today or in progress appear here. Add one below to get started.</p>
                            ) : (
                                <ul className="d-list">
                                    {focus.map((t) => {
                                        const overdue = t.dueDate && t.dueDate < today
                                        return (
                                            <li key={t.id} className="d-task">
                                                <button
                                                    type="button"
                                                    className="d-check"
                                                    onClick={() => markDone(t)}
                                                    aria-label={`Mark "${t.title}" as done`}
                                                />
                                                <span className="d-task-title">{t.title}</span>
                                                {t.status === 'doing' && <span className="d-flag">In progress</span>}
                                                <span className={`d-due ${overdue ? 'is-overdue' : ''}`}>
                                                    {t.dueDate ? (overdue ? `${formatDue(t.dueDate)} (overdue)` : formatDue(t.dueDate)) : 'No date'}
                                                </span>
                                                <span className={`d-pri ${t.priority || 'medium'}`}>
                                                    {PRIORITY_LABEL[t.priority] || 'Medium'}
                                                </span>
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}

                            {actionError && (
                                <p className="d-error" role="status">
                                    {actionError}{' '}
                                    <button type="button" onClick={() => setActionError('')}>Dismiss</button>
                                </p>
                            )}

                            <form className="d-add" onSubmit={quickAdd}>
                                <input
                                    type="text"
                                    placeholder="New task title"
                                    value={quickTitle}
                                    onChange={(e) => setQuickTitle(e.target.value)}
                                    aria-label="New task title"
                                />
                                <button type="submit" disabled={adding || !quickTitle.trim()}>
                                    {adding ? 'Adding task' : 'Add task'}
                                </button>
                            </form>
                        </section>

                        {/* week */}
                        <section className="d-panel">
                            <div className="d-panel-head">
                                <h2>Due dates, next 7 days</h2>
                                <span className="d-meta">{loadingTasks || tasksError ? '' : `${weekTotal} due`}</span>
                            </div>
                            <ul className="d-week" aria-label="Tasks due in the next 7 days">
                                {week.map((d) => (
                                    <li key={d.key} className={`${d.isToday ? 'is-today' : ''} ${d.count ? 'has' : ''}`}
                                        title={`${d.count} due`} aria-label={`${d.name} ${d.num}: ${d.count} due${d.isToday ? ', today' : ''}`}>
                                        <span>{d.name}</span>
                                        <b>{d.num}</b>
                                        <em>{loadingTasks || tasksError ? '' : d.count}</em>
                                    </li>
                                ))}
                            </ul>
                        </section>

                        {/* activity */}
                        <section className="d-panel">
                            <div className="d-panel-head">
                                <h2>What did you create this week?</h2>
                                <button type="button" className="d-textbtn" onClick={() => setChartAsTable((v) => !v)}>
                                    {chartAsTable ? 'Show chart' : 'Show table'}
                                </button>
                            </div>
                            <p className="d-meta d-summary">
                                {activity.totalTasks} {activity.totalTasks === 1 ? 'task' : 'tasks'} and {activity.totalNotes} {activity.totalNotes === 1 ? 'note' : 'notes'}, last 7 days including today
                            </p>

                            {loadingTasks || loadingNotes ? (
                                <div className="d-skel d-skel-chart" aria-busy="true" aria-label="Loading activity" />
                            ) : tasksError || notesError ? (
                                <p className="d-error" role="status">
                                    Could not load activity.{' '}
                                    <button type="button" onClick={() => { setTasksTry((n) => n + 1); setNotesTry((n) => n + 1) }}>Reload</button>
                                </p>
                            ) : activity.totalTasks + activity.totalNotes === 0 ? (
                                <p className="d-empty">Nothing created in the last 7 days. New tasks and notes appear here.</p>
                            ) : chartAsTable ? (
                                <div className="d-tablewrap">
                                    <table className="d-table">
                                        <caption className="sr-only">Tasks and notes created per day, last 7 days</caption>
                                        <thead><tr><th scope="col">Day</th><th scope="col">Tasks</th><th scope="col">Notes</th></tr></thead>
                                        <tbody>
                                            {activity.days.map((d) => (
                                                <tr key={d.key}><th scope="row">{d.full}</th><td>{d.tasks}</td><td>{d.notes}</td></tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <>
                                    <div className="d-chart" role="img"
                                        aria-label={`${activity.totalTasks} tasks and ${activity.totalNotes} notes created in the last 7 days. Use Show table for daily values.`}>
                                        {activity.days.map((d) => (
                                            <div key={d.key} className="d-chart-col" title={`${d.full}: ${d.tasks} tasks, ${d.notes} notes`}>
                                                <div className="d-chart-bars">
                                                    <span className="k-tasks" style={{ height: `${(d.tasks / activity.max) * 100}%` }} />
                                                    <span className="k-notes" style={{ height: `${(d.notes / activity.max) * 100}%` }} />
                                                </div>
                                                <small>{d.label}</small>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="d-legend">
                                        <span><i className="k-tasks" />Tasks</span>
                                        <span><i className="k-notes" />Notes</span>
                                        <span className="d-meta">Bars start at 0, top is {activity.max}</span>
                                    </p>
                                </>
                            )}
                        </section>
                    </div>

                    <div className="d-col">
                        {/* notes */}
                        <section className="d-panel">
                            <div className="d-panel-head">
                                <h2>Starred and latest</h2>
                                <Link to="/Note">All notes</Link>
                            </div>
                            {notesError ? (
                                <p className="d-error" role="status">
                                    Could not load your notes. Check your connection.{' '}
                                    <button type="button" onClick={() => setNotesTry((n) => n + 1)}>Reload notes</button>
                                </p>
                            ) : loadingNotes ? (
                                <ul className="d-list" aria-busy="true" aria-label="Loading notes">
                                    {[0, 1, 2].map((i) => <li key={i} className="d-skel" />)}
                                </ul>
                            ) : recentNotes.length === 0 ? (
                                <p className="d-empty">Notes you write appear here, starred ones first. <Link to="/Note">Write your first note</Link></p>
                            ) : (
                                <ul className="d-list">
                                    {recentNotes.map((n) => (
                                        <li key={n.id}>
                                            <Link to="/Note" className="d-note">
                                                <span className="d-note-text">
                                                    <strong>{n.starred && <span className="d-star" aria-label="Starred">★ </span>}{n.title}</strong>
                                                    <span>{n.content || 'No content'}</span>
                                                </span>
                                                <time>{timeAgo(n.createdAt)}{n.createdAt?.toDate ? ' ago' : ''}</time>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        {/* workload */}
                        <section className="d-panel">
                            <div className="d-panel-head">
                                <h2>Workload by priority</h2>
                            </div>
                            {tasksError ? (
                                <p className="d-error" role="status">
                                    Could not load your tasks.{' '}
                                    <button type="button" onClick={() => setTasksTry((n) => n + 1)}>Reload tasks</button>
                                </p>
                            ) : loadingTasks ? (
                                <div className="d-skel d-skel-chart" aria-busy="true" aria-label="Loading workload" />
                            ) : stats.open === 0 ? (
                                <p className="d-empty">Open tasks are grouped by priority here.</p>
                            ) : (
                                <div className="d-pri-rows">
                                    {['high', 'medium', 'low'].map((p) => (
                                        <div key={p} className="d-pri-row">
                                            <span>{PRIORITY_LABEL[p]}</span>
                                            <div className="d-meter">
                                                <i className={p} style={{ width: `${(stats.priority[p] / stats.open) * 100}%` }} />
                                            </div>
                                            <b>{stats.priority[p]}</b>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                </div>

                <GithubActivity />
            </main>

            <div className="d-live" role="status" aria-live="polite">
                {toast && (
                    <div className="d-toast" key={toast.id} onMouseEnter={pauseToastTimer} onMouseLeave={startToastTimer}
                        onFocus={pauseToastTimer} onBlur={startToastTimer}>
                        <span>{toast.text}</span>
                        {toast.undo && (
                            <button type="button" onClick={() => { toast.undo(); setToast(null) }}>Undo</button>
                        )}
                        <button type="button" className="d-toast-close" aria-label="Close message" onClick={() => setToast(null)}>×</button>
                    </div>
                )}
            </div>

            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} tasks={tasks} notes={notes} />
        </div>
    )
}

export default Home