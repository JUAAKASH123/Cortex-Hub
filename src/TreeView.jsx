import { useState } from 'react'
import { fileIcon, formatSize } from './fileTreeUtils'

const FOLDER_OPEN = '\u{1F4C2}'
const FOLDER_CLOSED = '\u{1F4C1}'
const CHEVRON = '\u25B8'

function TreeNode({ node, depth }) {
    const [open, setOpen] = useState(depth === 0) // top-level folders start open

    if (node.type === 'file') {
        return (
            <li>
                <div className="fm-row">
                    <span className="fm-chevron" />
                    <span>{fileIcon(node.name)}</span>
                    <span className="fm-name" title={node.path}>{node.name}</span>
                    {node.size != null && <span className="fm-size">{formatSize(node.size)}</span>}
                </div>
            </li>
        )
    }

    return (
        <li>
            <button
                type="button"
                className="fm-row"
                onClick={() => setOpen(!open)}
                aria-expanded={open}
            >
                <span className={`fm-chevron ${open ? 'open' : ''}`}>{CHEVRON}</span>
                <span>{open ? FOLDER_OPEN : FOLDER_CLOSED}</span>
                <span className="fm-name" title={node.path}>{node.name}</span>
            </button>

            {open && (
                <ul className="fm-children">
                    {node.children.map((child) => (
                        <TreeNode key={child.path} node={child} depth={depth + 1} />
                    ))}
                </ul>
            )}
        </li>
    )
}

function TreeView({ tree }) {
    return (
        <ul className="fm-tree">
            {tree.map((node) => (
                <TreeNode key={node.path} node={node} depth={0} />
            ))}
        </ul>
    )
}

export default TreeView
