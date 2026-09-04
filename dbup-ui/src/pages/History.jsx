/**
 * History — browse all DDL scripts across environments and entities.
 *
 * Features:
 *  - Filter by environment, entity, folder (shared/env-specific), and free-text search
 *  - Shows file path, ticket, schema extracted from content
 *  - Click to preview file content in a modal
 *  - Link to open file directly in GitLab
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useApp } from '../context/AppContext.jsx'
import Modal from '../components/Modal.jsx'
import Spinner from '../components/Spinner.jsx'
import {
  listDdlScripts,
  getFileContent,
  ENVIRONMENTS,
  ENTITIES,
  getRuntimeConfig,
  ticketExample,
  ticketSearchPattern,
} from '../services/api.js'

// ---------------------------------------------------------------------------
// FilePreviewModal
// ---------------------------------------------------------------------------
function FilePreviewModal({ open, onClose, file, project }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !file) return
    setContent('')
    setLoading(true)
    getFileContent(project.id, file.path)
      .then(f => setContent(f.content))
      .catch(err => setContent(`Error al cargar archivo:\n${err.message}`))
      .finally(() => setLoading(false))
  }, [open, file, project])

  const ticketLine = content.match(/--\s*JIRA_TICKET\s*:\s*(\S+)/i)?.[1] ?? ''
  const ticket = ticketSearchPattern().test(ticketLine) ? ticketLine : ''
  const schema  = content.match(/--\s*TARGET_SCHEMA\s*:\s*(\S+)/i)?.[1] ?? ''

  return (
    <Modal open={open} onClose={onClose} title={file?.name ?? ''} size="lg">
      <div className="space-y-3">
        {/* Meta row */}
        <div className="flex flex-wrap gap-3 text-xs">
          {ticket && (
            <span className="code text-gitlab-orange">{ticket}</span>
          )}
          {schema && (
            <span className="code text-gitlab-text">{schema}</span>
          )}
          <span className="code text-gitlab-muted font-mono break-all">{file?.path}</span>
          {project && file && (
            <a
              href={`${project.web_url}/-/blob/${getRuntimeConfig().defaultBranch}/${file.path}`}
              target="_blank"
              rel="noreferrer"
              className="text-gitlab-orange hover:underline ml-auto shrink-0"
            >
              Abrir en GitLab →
            </a>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center gap-2 justify-center py-16 text-gitlab-muted">
            <Spinner /> Cargando...
          </div>
        ) : (
          <pre className="text-xs font-mono bg-gitlab-darker border border-gitlab-border rounded-lg
                          p-4 whitespace-pre-wrap break-all text-gitlab-text leading-relaxed
                          max-h-[60vh] overflow-y-auto">
            {content}
          </pre>
        )}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// ScriptRow — single file entry
// ---------------------------------------------------------------------------
function ScriptRow({ script, project, env, entity, onPreview }) {
  const ENV_COLORS = {
    DEV: 'bg-blue-500/15 text-blue-400',
    QA:  'bg-yellow-500/15 text-yellow-400',
    UAT: 'bg-purple-500/15 text-purple-400',
  }

  const folderColor =
    script.envFolder === getRuntimeConfig().sharedFolder
      ? 'bg-green-500/15 text-green-400'
      : ENV_COLORS[env] ?? 'bg-gitlab-card text-gitlab-muted'

  const ticket = script.name.match(ticketSearchPattern())?.[0]?.toUpperCase() ?? ''
  const nameWithoutTicket = ticket && script.name.toUpperCase().startsWith(`${ticket}_`)
    ? script.name.slice(ticket.length + 1)
    : script.name
  const descSlug = nameWithoutTicket
    .replace(/\.sql$/, '')
    .replace(/_/g, ' ')

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gitlab-border
                 bg-gitlab-card hover:border-gitlab-muted transition-colors group"
    >
      {/* Icon */}
      <svg className="w-4 h-4 text-gitlab-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {ticket && (
            <span className="code text-xs text-gitlab-orange shrink-0">{ticket}</span>
          )}
          <span className="text-sm text-white truncate">{descSlug}</span>
        </div>
        <div className="text-xs text-gitlab-muted font-mono truncate mt-0.5">{script.path}</div>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${folderColor}`}>
          {script.envFolder}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded font-mono bg-gitlab-darker text-gitlab-muted border border-gitlab-border">
          {script.schema}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => onPreview(script)}
          className="btn-ghost text-xs py-1 px-2"
          title="Ver contenido"
        >
          👁 Ver
        </button>
        {project && (
          <a
            href={`${project.web_url}/-/blob/${getRuntimeConfig().defaultBranch}/${script.path}`}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost text-xs py-1 px-2 text-gitlab-muted"
            title="Abrir en GitLab"
          >
            ↗
          </a>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function History() {
  const { connectionStatus, projectMap, notify } = useApp()
  const isConnected = connectionStatus === 'connected'

  const [env, setEnv]         = useState(ENVIRONMENTS[0])
  const [entity, setEntity]   = useState(ENTITIES[0])
  const [search, setSearch]   = useState('')
  const [folderFilter, setFolderFilter] = useState('all') // all | shared | env

  const [scripts, setScripts]     = useState([])
  const [loading, setLoading]     = useState(false)
  const [previewFile, setPreviewFile] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const project = projectMap?.[env]?.[entity] ?? null

  const loadScripts = useCallback(async () => {
    if (!project) { setScripts([]); return }
    setLoading(true)
    try {
      const list = await listDdlScripts(project.id)
      setScripts(list)
    } catch (err) {
      notify('error', `Error al cargar historial: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [project, notify])

  useEffect(() => {
    if (isConnected && project) loadScripts()
  }, [env, entity, isConnected]) // eslint-disable-line

  // Client-side filtering
  const filtered = useMemo(() => {
    return scripts.filter(s => {
      if (folderFilter === 'shared' && s.envFolder !== getRuntimeConfig().sharedFolder) return false
      if (folderFilter === 'env'    && s.envFolder === getRuntimeConfig().sharedFolder) return false
      if (search) {
        const q = search.toLowerCase()
        if (!s.name.toLowerCase().includes(q) && !s.path.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [scripts, folderFilter, search])

  // Group by folder for display
  const grouped = useMemo(() => {
    const groups = {}
    for (const s of filtered) {
      const key = `${s.envFolder}/${s.schema}`
      if (!groups[key]) groups[key] = { envFolder: s.envFolder, schema: s.schema, files: [] }
      groups[key].files.push(s)
    }
    return Object.values(groups).sort((a, b) => {
      const sharedFolder = getRuntimeConfig().sharedFolder
      if (a.envFolder === sharedFolder && b.envFolder !== sharedFolder) return -1
      if (a.envFolder !== sharedFolder && b.envFolder === sharedFolder) return 1
      return a.schema.localeCompare(b.schema)
    })
  }, [filtered])

  function handlePreview(script) {
    setPreviewFile(script)
    setPreviewOpen(true)
  }

  const ENV_COLORS = {
    DEV: 'border-blue-500 text-blue-400 bg-blue-500/10',
    QA:  'border-yellow-500 text-yellow-400 bg-yellow-500/10',
    UAT: 'border-purple-500 text-purple-400 bg-purple-500/10',
  }

  if (!isConnected) {
    return (
      <div className="p-8 text-center text-gitlab-muted">
        <p>Conectate primero desde <a href="/config" className="text-gitlab-orange underline">Configuración</a>.</p>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: 'linear-gradient(180deg,#0de6b4,#cc27b0)' }} />
            <h1 className="page-title mb-0">Historial</h1>
          </div>
          <p className="text-xs text-dbup-muted ml-4">
            Scripts DDL existentes en el repositorio seleccionado.
          </p>
        </div>
        <button onClick={loadScripts} disabled={loading} className="btn-secondary text-sm flex items-center gap-2">
          {loading ? <Spinner size="sm" /> : '↻'} Actualizar
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-6 items-end">
          {/* Environment */}
          <div>
            <label className="label text-xs">Ambiente</label>
            <div className="flex gap-1.5">
              {ENVIRONMENTS.map(e => (
                <button key={e} onClick={() => setEnv(e)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    env === e
                      ? (ENV_COLORS[e] || 'border-dbup-teal text-dbup-teal bg-dbup-teal/10')
                      : 'border-gitlab-border text-gitlab-muted hover:border-gitlab-muted'
                  }`}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Entity */}
          <div>
            <label className="label text-xs">Entidad</label>
            <div className="flex gap-1.5">
              {ENTITIES.map(e => (
                <button key={e} onClick={() => setEntity(e)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    entity === e
                      ? 'border-gitlab-orange bg-gitlab-orange/10 text-white'
                      : 'border-gitlab-border text-gitlab-muted hover:border-gitlab-muted'
                  }`}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Folder type */}
          <div>
            <label className="label text-xs">Carpeta</label>
            <div className="flex gap-1.5">
              {[
                { value: 'all',    label: 'Todas' },
                { value: 'shared', label: getRuntimeConfig().sharedFolder },
                { value: 'env',    label: 'Específicas' },
              ].map(o => (
                <button key={o.value} onClick={() => setFolderFilter(o.value)}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    folderFilter === o.value
                      ? 'border-gitlab-orange bg-gitlab-orange/10 text-white'
                      : 'border-gitlab-border text-gitlab-muted hover:border-gitlab-muted'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="flex-1 min-w-48">
            <label className="label text-xs">Buscar</label>
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gitlab-muted"
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                className="input pl-8 text-sm py-1.5"
                placeholder={`${ticketExample()} o descripción...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {!project ? (
        <div className="card text-center py-10 text-gitlab-muted text-sm">
          Sin acceso al repo {env}/ENTIDAD{entity}.
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-gitlab-muted">
          <Spinner size="lg" /> Cargando scripts...
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-10">
          <div className="text-4xl mb-3">🗂️</div>
          <p className="text-gitlab-muted text-sm">
            {scripts.length === 0
              ? 'No hay scripts DDL en este repositorio todavía.'
              : 'Ningún script coincide con los filtros.'}
          </p>
          {search && (
            <button onClick={() => setSearch('')} className="btn-secondary text-sm mt-3">
              Limpiar búsqueda
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary bar */}
          <div className="flex items-center gap-4 text-sm text-gitlab-muted">
            <span>
              <strong className="text-white">{filtered.length}</strong> script{filtered.length !== 1 ? 's' : ''}
              {search && <> que coinciden con "<strong className="text-gitlab-text">{search}</strong>"</>}
            </span>
            {project && (
              <a href={`${project.web_url}/-/tree/${getRuntimeConfig().defaultBranch}/${getRuntimeConfig().ddlRoot}`}
                target="_blank" rel="noreferrer"
                className="ml-auto text-xs text-gitlab-orange hover:underline shrink-0">
                Ver carpeta en GitLab →
              </a>
            )}
          </div>

          {/* Grouped sections */}
          {grouped.map(group => (
            <section key={`${group.envFolder}/${group.schema}`}>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-mono border ${
                    group.envFolder === getRuntimeConfig().sharedFolder
                      ? 'bg-green-500/15 text-green-400 border-green-500/30'
                      : 'bg-gitlab-card text-gitlab-muted border-gitlab-border'
                  }`}>
                    {group.envFolder}
                  </span>
                  <span className="text-white font-medium text-sm">{group.schema}</span>
                  <span className="text-xs text-gitlab-muted">
                    ({group.files.length} archivo{group.files.length !== 1 ? 's' : ''})
                  </span>
                </div>
                <div className="flex-1 h-px bg-gitlab-border" />
              </div>

              <div className="space-y-1.5">
                {group.files.map(script => (
                  <ScriptRow
                    key={script.path}
                    script={script}
                    project={project}
                    env={env}
                    entity={entity}
                    onPreview={handlePreview}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Preview modal */}
      <FilePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        file={previewFile}
        project={project}
      />
    </div>
  )
}
