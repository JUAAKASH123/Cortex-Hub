/* ---------- Tree building ---------- */

// Turns GitHub's flat list [{ path: "src/pages/Chat.jsx", type: "blob" }, ...]
// into nested nodes: { name, path, type: 'dir' | 'file', size, total, count, children }
export function buildTree(items) {
    const root = { name: '', path: '', type: 'dir', children: [] }
    const dirs = new Map([['', root]])

    const ensureDir = (path) => {
        if (dirs.has(path)) return dirs.get(path)
        const idx = path.lastIndexOf('/')
        const parent = ensureDir(idx === -1 ? '' : path.slice(0, idx))
        const node = { name: path.slice(idx + 1), path, type: 'dir', children: [] }
        parent.children.push(node)
        dirs.set(path, node)
        return node
    }

    for (const item of items) {
        if (item.type === 'tree') {
            ensureDir(item.path)
            continue
        }
        const idx = item.path.lastIndexOf('/')
        const parent = ensureDir(idx === -1 ? '' : item.path.slice(0, idx))
        parent.children.push({
            name: item.path.slice(idx + 1),
            path: item.path,
            type: 'file',
            size: item.size,
        })
    }

    sortNodes(root)
    annotate(root)
    return root.children
}

// Folders first, then files, each A-Z
function sortNodes(node) {
    node.children.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
        return a.name.localeCompare(b.name)
    })
    node.children.forEach((child) => child.type === 'dir' && sortNodes(child))
}

// total = bytes inside, count = number of files inside
function annotate(node) {
    if (node.type === 'file') {
        node.total = node.size || 0
        node.count = 1
        return
    }
    node.total = 0
    node.count = 0
    for (const child of node.children) {
        annotate(child)
        node.total += child.total
        node.count += child.count
    }
}

/* ---------- Display helpers ---------- */

const FILE_ICONS = {
    js: '📜', ts: '📜',
    jsx: '⚛️', tsx: '⚛️',
    css: '🎨', scss: '🎨',
    html: '🌐',
    json: '🧾',
    md: '📝', txt: '📝',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️', ico: '🖼️',
    lock: '🔒',
}

// File kinds drive the chart colours
const KINDS = [
    { label: 'Code', hue: 210, exts: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'] },
    { label: 'Styles', hue: 280, exts: ['css', 'scss', 'sass', 'less'] },
    { label: 'Markup', hue: 20, exts: ['html', 'xml'] },
    { label: 'Data', hue: 150, exts: ['json', 'yml', 'yaml', 'lock', 'csv'] },
    { label: 'Docs', hue: 45, exts: ['md', 'txt'] },
    { label: 'Images', hue: 330, exts: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'] },
]

function extOf(name) {
    return name.includes('.') ? name.split('.').pop().toLowerCase() : ''
}

export function fileIcon(name) {
    return FILE_ICONS[extOf(name)] || '📄'
}

export function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// File and folder names come from the repository, so anything put into
// HTML (like chart tooltips) must be escaped first.
export function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

/* ---------- Text view ---------- */

export function toAscii(nodes, rootName) {
    const lines = [`${rootName}/`]

    const walk = (list, prefix) => {
        list.forEach((node, i) => {
            const last = i === list.length - 1
            lines.push(`${prefix}${last ? '└── ' : '├── '}${node.name}${node.type === 'dir' ? '/' : ''}`)
            if (node.type === 'dir') walk(node.children, prefix + (last ? '    ' : '│   '))
        })
    }

    walk(nodes, '')
    return lines.join('\n')
}

/* ---------- Graph view (React Flow) ---------- */

// Collects folder paths at or below minDepth (top-level entries are depth 1)
export function collectDirs(nodes, depth, minDepth, set = new Set()) {
    for (const node of nodes) {
        if (node.type !== 'dir') continue
        if (depth >= minDepth) set.add(node.path)
        collectDirs(node.children, depth + 1, minDepth, set)
    }
    return set
}

// Left-to-right layout. Leaves get consecutive rows; a parent sits in the
// middle of its children. A collapsed folder counts as a leaf.
export function layoutGraph(root, collapsed) {
    const nodes = []
    const links = []
    let rows = 0
    let maxDepth = 0

    const walk = (node, depth, parent) => {
        const item = { node, depth, y: 0 }
        nodes.push(item)
        maxDepth = Math.max(maxDepth, depth)

        const isOpen = node.type === 'dir' && node.children.length > 0 && (depth === 0 || !collapsed.has(node.path))

        if (isOpen) {
            const ys = node.children.map((child) => walk(child, depth + 1, item))
            item.y = (ys[0] + ys[ys.length - 1]) / 2
        } else {
            item.y = rows++
        }

        if (parent) links.push({ from: parent, to: item })
        return item.y
    }

    walk(root, 0, null)
    return { nodes, links, rows, maxDepth }
}

/* ---------- Treemap + Sunburst view (ECharts) ---------- */

const FOLDER_COLOR = 'rgba(128, 128, 128, 0.35)'

function fileColor(name) {
    const kind = KINDS.find((k) => k.exts.includes(extOf(name)))
    return kind ? `hsla(${kind.hue}, 60%, 50%, 0.55)` : 'rgba(128, 128, 128, 0.2)'
}

// Both ECharts series read the same nested { name, value, children } shape.
// size = real bytes (shown in tooltips); value = what sizes the tile/arc.
export function toChartData(nodes) {
    return nodes.map((node) => {
        if (node.type === 'file') {
            return {
                name: node.name,
                path: node.path,
                size: node.total,
                value: Math.max(node.total, 1), // empty files still get a sliver
                itemStyle: { color: fileColor(node.name) },
            }
        }
        const item = {
            name: node.name,
            path: node.path,
            size: node.total,
            itemStyle: { color: FOLDER_COLOR },
        }
        if (node.children.length) item.children = toChartData(node.children)
        else item.value = 1
        return item
    })
}