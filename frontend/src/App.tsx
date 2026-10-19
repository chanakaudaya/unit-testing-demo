import { useEffect, useMemo, useState } from 'react'
import './App.css'

type FileNode = {
  path: string
  name: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

type GitStatusItem = {
  path: string
  status: string
}

type SearchResult = {
  path: string
  line: number
  match_text: string
}

const defaultWorkspaceRoot = '/workspace'

const fileTreeSample: FileNode[] = [
  {
    path: '/workspace/src',
    name: 'src',
    type: 'directory',
    children: [
      { path: '/workspace/src/App.tsx', name: 'App.tsx', type: 'file' },
      { path: '/workspace/src/main.tsx', name: 'main.tsx', type: 'file' },
    ],
  },
  { path: '/workspace/package.json', name: 'package.json', type: 'file' },
]

function App() {
  const [workspaceRoot, setWorkspaceRoot] = useState(defaultWorkspaceRoot)
  const [tree, setTree] = useState<FileNode[]>(fileTreeSample)
  const [activePath, setActivePath] = useState('/workspace/src/App.tsx')
  const [content, setContent] = useState('export const app = "workspace";\nconsole.log(app)\n')
  const [gitStatus, setGitStatus] = useState<GitStatusItem[]>([
    { path: 'src/App.tsx', status: 'M' },
    { path: 'src/main.tsx', status: 'A' },
  ])
  const [searchText, setSearchText] = useState('workspace')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [command, setCommand] = useState('npm run dev')
  const [terminalOutput, setTerminalOutput] = useState('> workspace ready\n-> Files synced with backend')
  const [mode, setMode] = useState<'normal' | 'insert' | 'visual'>('normal')

  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/files/tree', {
          headers: { Accept: 'application/json' },
        })
        if (response.ok) {
          const data = (await response.json()) as FileNode[]
          if (data.length > 0) {
            setTree(data)
            const firstFile = findFirstFile(data)
            if (firstFile) {
              setActivePath(firstFile.path)
              void openFile(firstFile.path)
            }
          }
        }
      } catch {
        setTree(fileTreeSample)
      }
    }

    void loadWorkspace()
    void loadGitStatus()
  }, [])

  const activeTabCount = useMemo(() => {
    const flat = flattenFiles(tree)
    return flat.filter((item) => item.type === 'file').length
  }, [tree])

  const openFile = async (path: string) => {
    setActivePath(path)

    try {
      const response = await fetch(`http://localhost:3001/api/files/content?path=${encodeURIComponent(path)}`)
      if (response.ok) {
        const data = (await response.json()) as { path: string; content: string }
        setContent(data.content)
      }
    } catch {
      setContent('')
    }
  }

  const loadGitStatus = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/git/status')
      if (response.ok) {
        const data = (await response.json()) as GitStatusItem[]
        if (data.length > 0) {
          setGitStatus(data)
        }
      }
    } catch {
      setGitStatus([
        { path: 'src/App.tsx', status: 'M' },
        { path: 'src/main.tsx', status: 'A' },
      ])
    }
  }

  const handleSave = async () => {
    const response = await fetch('http://localhost:3001/api/files/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: activePath, content }),
    })

    if (response.ok) {
      setTerminalOutput((current) => `${current}\n> saved ${activePath}`)
      await loadGitStatus()
    }
  }

  const handleSearch = async () => {
    if (!searchText.trim()) {
      setSearchResults([])
      return
    }

    try {
      const response = await fetch(`http://localhost:3001/api/search?q=${encodeURIComponent(searchText)}`)
      if (response.ok) {
        const data = (await response.json()) as SearchResult[]
        setSearchResults(data)
      }
    } catch {
      setSearchResults([])
    }
  }

  const handleRun = async () => {
    const response = await fetch('http://localhost:3001/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, cwd: workspaceRoot }),
    })

    if (response.ok) {
      const data = (await response.json()) as { success: boolean; output: string; code?: number }
      setTerminalOutput((current) => `${current}\n$ ${command}\n${data.output}`)
    }
  }

  const fileList = flattenFiles(tree)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">V</div>
          <div>
            <p className="eyebrow">workspace</p>
            <h1>VimIDE</h1>
          </div>
        </div>

        <label className="workspace-input">
          <span>Root</span>
          <input value={workspaceRoot} onChange={(event) => setWorkspaceRoot(event.target.value)} />
        </label>

        <div className="panel-header">
          <span>Files</span>
          <button type="button" onClick={() => void handleSearch()}>
            Search
          </button>
        </div>
        <div className="tree">
          {tree.map((node) => (
            <FileTreeNode key={node.path} node={node} activePath={activePath} onOpen={openFile} depth={0} />
          ))}
        </div>

        <div className="panel-header">
          <span>Git</span>
          <span>{gitStatus.length}</span>
        </div>
        <ul className="git-status">
          {gitStatus.map((entry) => (
            <li key={`${entry.path}-${entry.status}`}>
              <span>{entry.path}</span>
              <strong>{entry.status}</strong>
            </li>
          ))}
        </ul>
      </aside>

      <main className="workspace-panel">
        <header className="topbar">
          <div className="topbar-group">
            <button type="button">File</button>
            <button type="button">Edit</button>
            <button type="button">View</button>
            <button type="button">Git</button>
          </div>
          <div className="topbar-group">
            <button type="button" onClick={() => setMode('normal')}>
              NORMAL
            </button>
            <button type="button" onClick={() => setMode('insert')}>
              INSERT
            </button>
            <button type="button" onClick={() => setMode('visual')}>
              VISUAL
            </button>
          </div>
        </header>

        <div className="command-row">
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search files or text"
          />
          <button type="button" onClick={() => void handleSearch()}>
            Search
          </button>
          <button type="button" onClick={() => void handleSave()}>
            Save
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="search-results">
            {searchResults.map((result, index) => (
              <button key={`${result.path}-${result.line}-${index}`} type="button" onClick={() => void openFile(result.path)}>
                <span>{result.path}:{result.line}</span>
                <code>{result.match_text}</code>
              </button>
            ))}
          </div>
        )}

        <div className="tabs">
          {fileList
            .filter((file) => file.type === 'file')
            .slice(0, 5)
            .map((file) => (
              <button
                key={file.path}
                type="button"
                className={file.path === activePath ? 'active' : ''}
                onClick={() => void openFile(file.path)}
              >
                {file.name}
              </button>
            ))}
          <span className="tab-count">{activeTabCount} open</span>
        </div>

        <div className="editor-area">
          <div className="editor-pane">
            <div className="editor-header">
              <span>{activePath}</span>
              <span className="mode-pill">{mode}</span>
            </div>
            <textarea value={content} onChange={(event) => setContent(event.target.value)} spellCheck={false} />
          </div>

          <div className="inspector-panel">
            <h3>Command Palette</h3>
            <input value={command} onChange={(event) => setCommand(event.target.value)} />
            <button type="button" className="run-button" onClick={() => void handleRun()}>
              Run task
            </button>
            <div className="diff-box">
              <h4>Diff</h4>
              <pre>{`- const app = 'starter'\n+ const app = 'workspace'`}</pre>
            </div>
          </div>
        </div>

        <div className="terminal-panel">
          <div className="terminal-header">
            <span>Terminal</span>
            <span>status: live</span>
          </div>
          <pre>{terminalOutput}</pre>
        </div>
      </main>
    </div>
  )
}

function FileTreeNode({
  node,
  activePath,
  onOpen,
  depth,
}: {
  node: FileNode
  activePath: string
  onOpen: (path: string) => Promise<void>
  depth: number
}) {
  if (node.type === 'directory') {
    return (
      <div className="tree-node">
        <div className="tree-directory" style={{ paddingLeft: depth * 12 }}>
          <span>📁</span>
          <strong>{node.name}</strong>
        </div>
        {node.children?.map((child) => (
          <FileTreeNode key={child.path} node={child} activePath={activePath} onOpen={onOpen} depth={depth + 1} />
        ))}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={`tree-file ${activePath === node.path ? 'active' : ''}`}
      style={{ paddingLeft: depth * 12 }}
      onClick={() => void onOpen(node.path)}
    >
      <span>📄</span>
      {node.name}
    </button>
  )
}

function flattenFiles(nodes: FileNode[], acc: FileNode[] = []): FileNode[] {
  for (const node of nodes) {
    acc.push(node)
    if (node.children) {
      flattenFiles(node.children, acc)
    }
  }
  return acc
}

function findFirstFile(nodes: FileNode[]): FileNode | undefined {
  for (const node of nodes) {
    if (node.type === 'file') return node
    if (node.children) {
      const found = findFirstFile(node.children)
      if (found) return found
    }
  }
  return undefined
}

export default App
