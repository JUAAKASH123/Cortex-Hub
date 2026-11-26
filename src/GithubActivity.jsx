import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import './github_activity.css'

const API = 'https://api.github.com'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LEVELS = {
    NONE: 0,
    FIRST_QUARTILE: 1,
    SECOND_QUARTILE: 2,
    THIRD_QUARTILE: 3,
    FOURTH_QUARTILE: 4,
}

// The contribution calendar is only available through GitHub's GraphQL API
const CALENDAR_QUERY = `
query {
  viewer {
    login
    url
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays { date contributionCount contributionLevel weekday }
        }
      }
    }
  }
}`

function expired() {
    const err = new Error('GitHub session expired. Reconnect it from the File Manager.')
    err.code = 'expired'
    return err
}

async function fetchCalendar(token) {
    const res = await fetch(`${API}/graphql`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: CALENDAR_QUERY }),
    })
    if (res.status === 401) throw expired()
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
    const json = await res.json()
    if (json.errors?.length || !json.data?.viewer) throw new Error('Could not read your GitHub contributions.')
    return json.data.viewer
}

async function ghGet(path, token) {
    const res = await fetch(`${API}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    })
    if (res.status === 401) throw expired()
    if (!res.ok) return null // empty repo, no access, etc: just skip it
    return res.json()
}

// Looks at your most recently pushed repos and returns your newest commit
async function fetchLastCommit(token, login) {
    const repos = await ghGet('/user/repos?sort=pushed&per_page=6', token)
    if (!repos?.length) return null

    const results = await Promise.all(
        repos.map(async (repo) => {
            const commits = await ghGet(
                `/repos/${repo.full_name}/commits?author=${encodeURIComponent(login)}&per_page=1`,
                token
            )
            const c = commits?.[0]
            if (!c) return null
            return {
                repo: repo.full_name,
                sha: c.sha.slice(0, 7),
                url: c.html_url,
                message: c.commit.message.split('\n')[0],
                date: c.commit.author?.date || c.commit.committer?.date,
            }
        })
    )

    return results
        .filter(Boolean)
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null
}

const parseDay = (str) => {
    const [y, m, d] = str.split('-').map(Number)
    return new Date(y, m - 1, d)
}

const timeAgo = (iso) => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}d ago`
    if (days < 365) return `${Math.floor(days / 30)}mo ago`
    return `${Math.floor(days / 365)}y ago`
}

function GithubActivity() {
    const [token, setToken] = useState(() => sessionStorage.getItem('gh_token'))
    const [calendar, setCalendar] = useState(null) // { login, url, total, weeks }
    const [lastCommit, setLastCommit] = useState(null)
    const [loading, setLoading] = useState(false)
    const [loadingCommit, setLoadingCommit] = useState(false)
    const [error, setError] = useState('')
    const scrollRef = useRef(null)

    useEffect(() => {
        if (!token) return
        let cancelled = false
        setLoading(true)
        setLoadingCommit(true)
        setError('')

        const onError = (err) => {
            if (cancelled) return
            if (err.code === 'expired') {
                sessionStorage.removeItem('gh_token')
                setToken(null)
            }
            setError(err.message)
        }

        fetchCalendar(token)
            .then((viewer) => {
                if (cancelled) return
                const cal = viewer.contributionsCollection.contributionCalendar
                setCalendar({
                    login: viewer.login,
                    url: viewer.url,
                    total: cal.totalContributions,
                    weeks: cal.weeks,
                })
                setLoading(false)
                return fetchLastCommit(token, viewer.login)
            })
            .then((commit) => {
                if (!cancelled) setLastCommit(commit || null)
            })
            .catch(onError)
            .finally(() => {
                if (cancelled) return
                setLoading(false)
                setLoadingCommit(false)
            })

        return () => {
            cancelled = true
        }
    }, [token])

    // start scrolled to the newest weeks on narrow screens
    useEffect(() => {
        if (calendar && scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
    }, [calendar])

    // streaks and active days, worked out from the calendar
    const streaks = useMemo(() => {
        if (!calendar) return null
        const days = calendar.weeks.flatMap((w) => w.contributionDays)
        let longest = 0
        let run = 0
        days.forEach((d) => {
            run = d.contributionCount > 0 ? run + 1 : 0
            longest = Math.max(longest, run)
        })
        // an empty "today" should not break a streak that is still alive
        let i = days.length - 1
        if (i >= 0 && days[i].contributionCount === 0) i--
        let current = 0
        while (i >= 0 && days[i].contributionCount > 0) {
            current++
            i--
        }
        return { current, longest, active: days.filter((d) => d.contributionCount > 0).length }
    }, [calendar])

    /* ---------- not connected ---------- */
    if (!token) {
        return (
            <section className="home-card gh-card">
                <div className="home-card-head">
                    <h2>GitHub activity</h2>
                </div>
                {error && <p className="gh-error" role="alert">{error}</p>}
                <div className="home-empty">
                    <strong>Connect GitHub to see your contributions</strong>
                    <span>Your contribution graph and latest commit will show up here.</span>
                    <Link to="/FileManager" className="gh-connect">Connect in File Manager</Link>
                </div>
            </section>
        )
    }

    /* ---------- month labels ---------- */
    const weeks = calendar?.weeks || []
    const months = []
    let lastMonth = -1
    let lastIdx = -10
    weeks.forEach((week, i) => {
        const first = week.contributionDays[0]
        if (!first) return
        const m = parseDay(first.date).getMonth()
        if (m !== lastMonth) {
            lastMonth = m
            // skip labels that would collide with the previous one or fall off the edge
            if (i - lastIdx >= 3 && i <= weeks.length - 3) {
                months.push({ i, label: MONTHS[m] })
                lastIdx = i
            }
        }
    })

    const columns = `repeat(${weeks.length}, var(--cell))`

    return (
        <section className="home-card gh-card">
            <div className="home-card-head">
                <h2>
                    {loading
                        ? 'GitHub activity'
                        : calendar
                        ? `${calendar.total.toLocaleString()} contributions in the last year`
                        : 'GitHub activity'}
                </h2>
                {calendar && (
                    <a className="home-link" href={calendar.url} target="_blank" rel="noreferrer">
                        @{calendar.login}
                    </a>
                )}
            </div>

            {error && <p className="gh-error" role="alert">{error}</p>}

            <div className="gh-layout">
                {/* ---------- graph ---------- */}
                <div className="gh-main">
                    {loading ? (
                        <div className="home-skeleton gh-skeleton" aria-busy="true" />
                    ) : calendar ? (
                        <>
                            <div className="gh-scroll" ref={scrollRef}>
                                <div
                                    className="gh-graph"
                                    role="img"
                                    aria-label={`${calendar.total} contributions in the last year`}
                                >
                                    <span />
                                    <div className="gh-months" style={{ gridTemplateColumns: columns }} aria-hidden="true">
                                        {months.map((m) => (
                                            <span key={m.i} style={{ gridColumn: m.i + 1 }}>{m.label}</span>
                                        ))}
                                    </div>

                                    <div className="gh-days" aria-hidden="true">
                                        <span style={{ gridRow: 2 }}>Mon</span>
                                        <span style={{ gridRow: 4 }}>Wed</span>
                                        <span style={{ gridRow: 6 }}>Fri</span>
                                    </div>

                                    <div className="gh-cells" style={{ gridTemplateColumns: columns }} aria-hidden="true">
                                        {weeks.map((week, wi) =>
                                            week.contributionDays.map((day) => {
                                                const label = parseDay(day.date).toLocaleDateString(undefined, {
                                                    weekday: 'short',
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric',
                                                })
                                                return (
                                                    <i
                                                        key={day.date}
                                                        className={`gh-cell l${LEVELS[day.contributionLevel] ?? 0}`}
                                                        style={{ gridColumn: wi + 1, gridRow: day.weekday + 1 }}
                                                        title={`${day.contributionCount} ${day.contributionCount === 1 ? 'contribution' : 'contributions'} on ${label}`}
                                                    />
                                                )
                                            })
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="gh-legend" aria-hidden="true">
                                <span>Less</span>
                                {[0, 1, 2, 3, 4].map((l) => <i key={l} className={`gh-cell l${l}`} />)}
                                <span>More</span>
                            </div>
                        </>
                    ) : null}
                </div>

                {/* ---------- side panels ---------- */}
                <div className="gh-side">
                    <aside className="gh-panel" aria-label="Last commit">
                        <span className="gh-side-label">Last commit</span>

                        {loadingCommit ? (
                            <div className="home-skeleton gh-skeleton-sm" aria-busy="true" />
                        ) : lastCommit ? (
                            <>
                                <a className="gh-commit-msg" href={lastCommit.url} target="_blank" rel="noreferrer">
                                    {lastCommit.message}
                                </a>
                                <span className="gh-commit-repo">{lastCommit.repo}</span>
                                <span className="gh-commit-meta">
                                    <code>{lastCommit.sha}</code>
                                    <span>{timeAgo(lastCommit.date)}</span>
                                </span>
                            </>
                        ) : (
                            <span className="gh-commit-none">No recent commits found in your latest repositories.</span>
                        )}
                    </aside>

                    {streaks && (
                        <div className="gh-stats" aria-label="Contribution streaks">
                            <div><strong>{streaks.current}</strong><span>Current streak</span></div>
                            <div><strong>{streaks.longest}</strong><span>Longest streak</span></div>
                            <div><strong>{streaks.active}</strong><span>Active days</span></div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}

export default GithubActivity