import { useEffect, useMemo, useState } from 'react'
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, useNodesState } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { collectDirs, fileIcon, layoutGraph } from './fileTreeUtils'

const COL_W = 220 // horizontal distance between levels
const ROW_H = 42  // vertical distance between rows

/* One box in the graph: icon + name (+ file count when a folder is collapsed) */
function FileNode({ data }) {
    const { node, isCollapsed, clickable } = data
    const icon = node.type === 'dir' ? (isCollapsed ? '📁' : '📂') : fileIcon(node.name)

    return (
        <div
            className={`fm-node ${node.type} ${clickable ? 'clickable' : ''}`}
            title={node.path || node.name}
        >
            <Handle type="target" position={Position.Left} className="fm-handle" isConnectable={false} />
            <span>{icon}</span>
            <span className="fm-node-name">{node.name}</span>
            {isCollapsed && <span className="fm-node-count">+{node.count}</span>}
            <Handle type="source" position={Position.Right} className="fm-handle" isConnectable={false} />
        </div>
    )
}

// defined outside the component so React Flow gets the same object every render
const nodeTypes = { file: FileNode }

function buildFlow(root, collapsed) {
    const { nodes, links } = layoutGraph(root, collapsed)
    const idOf = (node) => node.path || '__root'

    return {
        nodes: nodes.map(({ node, depth, y }) => ({
            id: idOf(node),
            type: 'file',
            position: { x: depth * COL_W, y: y * ROW_H },
            data: {
                node,
                isCollapsed: node.type === 'dir' && depth > 0 && collapsed.has(node.path),
                clickable: node.type === 'dir' && depth > 0 && node.children.length > 0,
            },
        })),
        edges: links.map(({ from, to }) => ({
            id: `${idOf(from.node)}->${idOf(to.node)}`,
            source: idOf(from.node),
            target: idOf(to.node),
        })),
    }
}

const SMALL_REPO = 30 // repos with this many files + folders or fewer open fully expanded

function countNodes(nodes) {
    return nodes.reduce((sum, n) => sum + 1 + (n.type === 'dir' ? countNodes(n.children) : 0), 0)
}

function startingCollapsed(tree, mode) {
    if (mode === 'expanded') return new Set()
    if (mode === 'collapsed') return collectDirs(tree, 1, 1)
    // default: a small repo opens fully; a big one starts with only the top level
    // visible (folders show +N), because a fully open graph is too tall to read
    return countNodes(tree) <= SMALL_REPO ? new Set() : collectDirs(tree, 1, 1)
}

function FlowCanvas({ tree, repoName, mode }) {
    const [collapsed, setCollapsed] = useState(() => startingCollapsed(tree, mode))

    const root = useMemo(
        () => ({ name: repoName, path: '', type: 'dir', children: tree }),
        [tree, repoName]
    )
    const flow = useMemo(() => buildFlow(root, collapsed), [root, collapsed])
    const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes)

    // When folders are expanded or collapsed, lay the nodes out again,
    // keeping the sizes React Flow already measured so nothing flickers.
    useEffect(() => {
        setNodes((previous) => {
            const measured = new Map(previous.map((n) => [n.id, n.measured]))
            return flow.nodes.map((n) => (measured.get(n.id) ? { ...n, measured: measured.get(n.id) } : n))
        })
    }, [flow, setNodes])

    const onNodeClick = (_event, node) => {
        if (!node.data.clickable) return
        setCollapsed((previous) => {
            const next = new Set(previous)
            if (next.has(node.id)) next.delete(node.id)
            else next.add(node.id)
            return next
        })
    }

    return (
        <div className="fm-flow-wrap">
            <ReactFlow
                className="fm-flow"
                nodes={nodes}
                edges={flow.edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onNodeClick={onNodeClick}
                nodesConnectable={false}
                elementsSelectable={false}
                fitView
                fitViewOptions={{ padding: 0.15, minZoom: 0.5, maxZoom: 1 }}
                minZoom={0.05}
            >
                <Background gap={22} color="rgba(128,128,128,0.35)" />
                <Controls showInteractive={false} />
                <MiniMap pannable zoomable style={{ width: 130, height: 86 }} />
            </ReactFlow>
        </div>
    )
}

function GraphView({ tree, repoName }) {
    // changing the key re-creates the canvas, which re-fits the view to the new layout
    const [preset, setPreset] = useState({ mode: 'default', n: 0 })
    const choose = (mode) => setPreset((p) => ({ mode, n: p.n + 1 }))

    return (
        <div>
            <div className="fm-toolbar">
                <button type="button" onClick={() => choose('expanded')}>Expand all</button>
                <button type="button" onClick={() => choose('collapsed')}>Collapse all</button>
                <span className="fm-hint">
                    Click a folder to expand or collapse it. Drag to pan, scroll to zoom. +N is the number of files inside.
                </span>
            </div>
            <FlowCanvas key={preset.n} tree={tree} repoName={repoName} mode={preset.mode} />
        </div>
    )
}

export default GraphView