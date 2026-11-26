import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { linkWithPopup, reauthenticateWithPopup } from 'firebase/auth'
import { auth, githubProvider } from './firebase'
import { saveGithubToken } from './githubToken'
import { buildTree } from './fileTreeUtils'
import TreeView from './TreeView'
import './file_manager.css'
import Navbar from './navbar'

// React Flow is big, so the graph loads only when its tab is first opened
const GraphView = lazy(() => import('./GraphView'))

const API = 'https://api.github.com'

const VIEWS = [
    { id: 'tree', label: 'Tree' },
    { id: 'graph', label: 'Graph' },
]

const LANG_COLORS = {
    JavaScript: '#f1e05a',
    TypeScript: '#3178c6',
    Python: '#3572a5',
    HTML: '#e34c26',
    CSS: '#7c5cff',
    Java: '#b07219',
    'C++': '#f34b7d',
    Go: '#00add8',
    Rust: '#dea584',
}

async function ghGet(path, token) {
    const res = await fetch(`${API}${path}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
        },
    })

    if (res.status === 401) {
        const err = new Error('GitHub session expired. Please reconnect.')
        err.code = 'expired'
        throw err
    }
    if (res.status === 409) throw new Error('This repository is empty.')
    if (res.status === 403) throw new Error('GitHub refused the request. You may have hit the rate limit.')
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)

    return res.json()
}

function timeAgo(iso) {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
    if (days < 1) return 'today'
    if (days < 30) return `${days}d ago`
    if (days < 365) return `${Math.floor(days / 30)}mo ago`
    return `${Math.floor(days / 365)}y ago`
}

function FileManager() {
    const [token, setToken] = useState(sessionStorage.getItem('gh_token'))
    const [repos, setRepos] = useState([])
    const [selected, setSelected] = useState(null) // full repo object
    const [tree, setTree] = useState([])
    const [stats, setStats] = useState(null) // { files, folders, truncated }
    const [view, setView] = useState('tree')
    const [filter, setFilter] = useState('')
    const [loadingRepos, setLoadingRepos] = useState(false)
    const [loadingTree, setLoadingTree] = useState(false)
    const [error, setError] = useState('')

    // 1. Load the user's repositories
    useEffect(() => {
        if (!token) return
        let cancelled = false
        setLoadingRepos(true)
        setError('')

        ghGet('/user/repos?sort=updated&per_page=100', token)
            .then((data) => {
                if (!cancelled) setRepos(data)
            })
            .catch((err) => {
                if (cancelled) return
                if (err.code === 'expired') {
                    sessionStorage.removeItem('gh_token')
                    setToken(null)
                }
                setError(err.message)
            })
            .finally(() => {
                if (!cancelled) setLoadingRepos(false)
            })

        return () => {
            cancelled = true
        }
    }, [token])

    // 2. Load the file tree whenever a repo is selected
    useEffect(() => {
        if (!selected || !token) return
        let cancelled = false
        setLoadingTree(true)
        setError('')

        ghGet(`/repos/${selected.full_name}/git/trees/${selected.default_branch}?recursive=1`, token)
            .then((data) => {
                if (cancelled) return
                setTree(buildTree(data.tree))
                setStats({
                    files: data.tree.filter((i) => i.type === 'blob').length,
                    folders: data.tree.filter((i) => i.type === 'tree').length,
                    truncated: data.truncated,
                })
            })
            .catch((err) => {
                if (cancelled) return
                if (err.code === 'expired') {
                    sessionStorage.removeItem('gh_token')
                    setToken(null)
                }
                setError(err.message)
            })
            .finally(() => {
                if (!cancelled) setLoadingTree(false)
            })

        return () => {
            cancelled = true
        }
    }, [selected, token])

    const connectGithub = async () => {
        setError('')
        try {
            const user = auth.currentUser
            const hasGithub = user.providerData.some((p) => p.providerId === 'github.com')

            // already linked -> fetch a fresh token; otherwise link GitHub to this account
            const result = hasGithub
                ? await reauthenticateWithPopup(user, githubProvider)
                : await linkWithPopup(user, githubProvider)

            saveGithubToken(result)
            setToken(sessionStorage.getItem('gh_token'))
        } catch (err) {
            if (err.code === 'auth/credential-already-in-use') {
                setError('That GitHub account is already linked to another Cortex Hub account.')
            } else if (err.code === 'auth/popup-closed-by-user') {
                setError('Sign-in popup was closed.')
            } else {
                setError('Could not connect to GitHub.')
            }
        }
    }

    const openRepo = (repo) => {
        setSelected(repo)
        setTree([])
        setStats(null)
        setError('')
    }

    const closeRepo = () => {
        setSelected(null)
        setTree([])
        setStats(null)
        setError('')
    }

    const visibleRepos = useMemo(() => {
        const q = filter.trim().toLowerCase()
        return q ? repos.filter((r) => r.name.toLowerCase().includes(q)) : repos
    }, [repos, filter])

    return (
        <div className="fm-page">
            <Navbar />

            <header className="fm-header">
                <h1 className="fm-title">File Manager</h1>
                {!selected && <p className="fm-sub">Open a repository to see its structure as a tree or a graph.</p>}
            </header>

            {error && (
                <p className="fm-error" role="alert">
                    {error}
                </p>
            )}

            {/* ---------- Not connected ---------- */}
            {!token && (
                <section className="fm-connect">
                    <h2>Connect your GitHub account</h2>
                    <p>Cortex Hub reads your repository list and file names. It never changes your code.</p>
                    <button type="button" className="fm-btn-primary" onClick={connectGithub}>
                        Connect GitHub
                    </button>
                </section>
            )}

            {/* ---------- Screen 1: pick a repository ---------- */}
            {token && !selected && (
                <section aria-label="Repositories">
                    <div className="fm-picker-bar">
                        <input
                            type="search"
                            className="fm-search"
                            placeholder="Search your repositories"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            aria-label="Search repositories"
                        />
                        {!loadingRepos && (
                            <span className="fm-count">
                                {visibleRepos.length} of {repos.length}
                            </span>
                        )}
                    </div>

                    {loadingRepos ? (
                        <ul className="fm-grid" aria-busy="true">
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                                <li key={i} className="fm-skeleton" />
                            ))}
                        </ul>
                    ) : visibleRepos.length === 0 ? (
                        <p className="fm-status">
                            {repos.length === 0 ? 'No repositories found on this account.' : 'No repository matches that name.'}
                        </p>
                    ) : (
                        <ul className="fm-grid">
                            {visibleRepos.map((repo) => (
                                <li key={repo.id}>
                                    <button type="button" className="fm-card" onClick={() => openRepo(repo)}>
                                        <span className="fm-card-top">
                                            <span className="fm-card-name">{repo.name}</span>
                                            {repo.private && <span className="fm-pill">Private</span>}
                                        </span>
                                        <span className="fm-card-desc">{repo.description || 'No description'}</span>
                                        <span className="fm-card-meta">
                                            {repo.language && (
                                                <span className="fm-lang">
                                                    <i
                                                        className="fm-dot"
                                                        style={{ background: LANG_COLORS[repo.language] || '#8b8b8b' }}
                                                    />
                                                    {repo.language}
                                                </span>
                                            )}
                                            <span>Updated {timeAgo(repo.updated_at)}</span>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            {/* ---------- Screen 2: explore one repository ---------- */}
            {token && selected && (
                <section className="fm-explorer">
                    <div className="fm-toolbar-bar">
                        <button type="button" className="fm-back" onClick={closeRepo}>
                            ‹ All repositories
                        </button>

                        <div className="fm-repo-id">
                            <strong className="fm-repo-title">
                                <span className="fm-owner">{selected.owner.login}/</span>
                                {selected.name}
                            </strong>
                            <span className="fm-pill">{selected.default_branch}</span>
                            {stats && (
                                <span className="fm-stats">
                                    <b>{stats.files.toLocaleString()}</b> files, <b>{stats.folders.toLocaleString()}</b> folders
                                </span>
                            )}
                        </div>

                        <div className="fm-tabs" role="tablist" aria-label="Display mode">
                            {VIEWS.map((v) => (
                                <button
                                    key={v.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={view === v.id}
                                    className="fm-tab"
                                    onClick={() => setView(v.id)}
                                >
                                    {v.label}
                                </button>
                            ))}
                        </div>

                        <a className="fm-link" href={selected.html_url} target="_blank" rel="noreferrer">
                            Open on GitHub
                        </a>
                    </div>

                    <div className="fm-panel">
                        {loadingTree && <p className="fm-status">Loading file structure...</p>}

                        {!loadingTree && tree.length > 0 && (
                            <Suspense fallback={<p className="fm-status">Loading view...</p>}>
                                {view === 'tree' && <TreeView tree={tree} />}
                                {view === 'graph' && <GraphView tree={tree} repoName={selected.name} />}
                            </Suspense>
                        )}

                        {stats?.truncated && (
                            <p className="fm-warn">
                                This repository is too large to show in full. Only part of the structure is listed.
                            </p>
                        )}
                    </div>
                </section>
            )}
        </div>
    )
}

export default FileManager