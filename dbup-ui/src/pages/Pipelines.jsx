/**
 * Pipelines — view, filter and act on GitLab pipelines.
 *
 * Features:
 *  - Selector de ambiente (DEV/QA/UAT) y entidad (700-703)
 *  - Lista paginada de pipelines con estado
 *  - Expandir pipeline → ver jobs por stage
 *  - Play job manual (deploy:dev, deploy:qa, deploy:uat, distribute:dev, promote:qa)
 *  - Retry / cancel job o pipeline completo
 *  - Ver log (trace) de cualquier job en un modal
 *  - URL params: ?env=DEV&entity=700 para deep-link desde Dashboard
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Spinner from '../components/Spinner.jsx'
import Modal from '../components/Modal.jsx'
import {
  getPipelines,
  getPipelineJobs,
  getPipeline,
  playJob,
  retryJob,
  cancelJob,
  retryPipeline,
  cancelPipeline,
  getJobTrace,
  ENVIRONMENTS,
  ENTITIES,
  getRuntimeConfig,
  ticketExample,
} from '../services/api.js'

const REFRESH_MS = 20_000

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function duration(startedAt, finishedAt) {
  if (!startedAt) return null
  const end = finishedAt ? new Date(finishedAt) : new Date()
  const secs = Math.round((end - new Date(startedAt)) / 1000)
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60), s = secs % 60
  return `${m}m ${s}s`
}

// Status → action buttons definition
function jobActions(job) {
  const actions = []
  if (job.status === 'manual' || job.status === 'created') {
    actions.push({ key: 'play', label: '▶ Ejecutar', variant: 'orange' })
  }
  if (['failed', 'canceled'].includes(job.status)) {
    actions.push({ key: 'retry', label: '↻ Reintentar', variant: 'secondary' })
  }
  if (['running', 'pending'].includes(job.status)) {
    actions.push({ key: 'cancel', label: '✕ Cancelar', variant: 'danger' })
  }
  return actions
}

// ---------------------------------------------------------------------------
// LogModal — shows raw job trace
// ---------------------------------------------------------------------------
function LogModal({ open, onClose, job, project }) {
  const [log, setLog]       = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!open || !job) return
    setLog('')
    setLoading(true)
    getJobTrace(project.id, job.id)
      .then(text => { setLog(text || '(log vacío)') })
      .catch(err  => { setLog(`Error al cargar log: ${err.message}`) })
      .finally(() => setLoading(false))
  }, [open, job, project])

  useEffect(() => {
    if (log) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  return (
    <Modal open={open} onClose={onClose} size="xl"
      title={job ? `Log — ${job.name} (job #${job.id})` : 'Log'}>
      <div className="flex items-center justify-between mb-3 text-xs text-gitlab-muted">
        {job && (
          <>
            <div className="flex items-center gap-3">
              <StatusBadge status={job.status} />
              <span>Stage: <strong className="text-gitlab-text">{job.stage}</strong></span>
              {job.started_at && (
                <span>Duración: <strong className="text-gitlab-text">{duration(job.started_at, job.finished_at)}</strong></span>
              )}
            </div>
            {project && (
              <a href={`${project.web_url}/-/jobs/${job.id}`}
                target="_blank" rel="noreferrer"
                className="text-gitlab-orange hover:underline shrink-0">
                Abrir en GitLab →
              </a>
            )}
          </>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 justify-center py-16 text-gitlab-muted">
          <Spinner /> Cargando log...
        </div>
      ) : (
        <pre className="text-xs font-mono bg-gitlab-darker border border-gitlab-border rounded-lg p-4
                        whitespace-pre-wrap break-all text-green-300 leading-relaxed
                        max-h-[60vh] overflow-y-auto">
          {log}
          <div ref={bottomRef} />
        </pre>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// StageDots — visual pipeline stages indicator (validate → deploy → promote)
// ---------------------------------------------------------------------------
function StageDots({ jobs }) {
  if (!jobs || jobs.length === 0) return null

  // Collect unique stages in order
  const stageOrder = []
  const stageStatus = {}
  for (const job of jobs) {
    if (!stageStatus[job.stage]) {
      stageOrder.push(job.stage)
      stageStatus[job.stage] = job.status
    } else {
      // If any job in the stage failed, mark the whole stage as failed
      const prev = stageStatus[job.stage]
      if (job.status === 'failed') stageStatus[job.stage] = 'failed'
      else if (job.status === 'running' && prev !== 'failed') stageStatus[job.stage] = 'running'
      else if (job.status === 'manual' && prev === 'created') stageStatus[job.stage] = 'manual'
    }
  }

  const dotColors = {
    success:  '#0de6b4',
    failed:   '#f87171',
    running:  '#60a5fa',
    pending:  '#fbbf24',
    manual:   '#cc27b0',
    canceled: '#6b7280',
    skipped:  '#6b7280',
    created:  '#4b5563',
  }

  return (
    <div className="flex items-center gap-0.5">
      {stageOrder.map((stage, i) => {
        const color = dotColors[stageStatus[stage]] || '#4b5563'
        const isLast = i === stageOrder.length - 1
        return (
          <div key={stage} className="flex items-center gap-0.5" title={`${stage}: ${stageStatus[stage]}`}>
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: color, boxShadow: stageStatus[stage] === 'running' ? `0 0 6px ${color}` : 'none' }}
            />
            {!isLast && (
              <div className="w-3 h-px" style={{ background: '#2a3260' }} />
            )}
          </div>
        )
      })}
      <span className="text-xs text-dbup-muted ml-1.5 hidden lg:inline">
        {stageOrder.map(s => s.replace('deploy:', '').replace('validate:', '')).join(' → ')}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PipelineRow — shows commit message, stage dots, and expandable job details
// ---------------------------------------------------------------------------
function PipelineRow({ pipeline, project, notify, onPipelineAction }) {
  const [expanded, setExpanded]   = useState(false)
  const [jobs, setJobs]           = useState(null)
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [logJob, setLogJob]       = useState(null)
  const [logOpen, setLogOpen]     = useState(false)

  // Auto-load jobs on mount to show stage dots and commit info
  useEffect(() => {
    if (!project || !pipeline) return
    let cancelled = false
    setLoadingJobs(true)
    getPipelineJobs(project.id, pipeline.id)
      .then(j => { if (!cancelled) setJobs(j) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingJobs(false) })
    return () => { cancelled = true }
  }, [project?.id, pipeline?.id])

  function toggleExpand() {
    setExpanded(v => !v)
  }

  async function handleJobAction(job, actionKey) {
    setActionLoading(job.id)
    try {
      if (actionKey === 'play') {
        const variables = []
        const appConfig = getRuntimeConfig()
        if (job.name.startsWith(`${appConfig.rollbackJobPrefix}:`)) {
          const projectEntity = project.name.match(/\d+/)?.[0] ?? ENTITIES[0]
          const rollbackScript = window.prompt(
            `Ruta del rollback a ejecutar (relativa a ${appConfig.rollbackRoot}):`,
            `${appConfig.sharedFolder}/${appConfig.schemaTypes[0]}${projectEntity}/${ticketExample()}_descripcion_rollback.sql`
          )
          if (!rollbackScript) return
          variables.push({ key: 'DBUP_ROLLBACK_SCRIPT', value: rollbackScript.trim() })
        }
        await playJob(project.id, job.id, variables)
      }
      if (actionKey === 'retry')  await retryJob(project.id, job.id)
      if (actionKey === 'cancel') await cancelJob(project.id, job.id)
      notify('success', `Job "${job.name}" actualizado`)
      // Refresh jobs after a short delay
      setTimeout(async () => {
        const j = await getPipelineJobs(project.id, pipeline.id)
        setJobs(j)
        onPipelineAction()
      }, 1500)
    } catch (err) {
      notify('error', `Error: ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  async function handlePipelineAction(action) {
    setActionLoading('pipeline')
    try {
      if (action === 'retry')  await retryPipeline(project.id, pipeline.id)
      if (action === 'cancel') await cancelPipeline(project.id, pipeline.id)
      notify('success', `Pipeline #${pipeline.id} ${action === 'retry' ? 'reintentado' : 'cancelado'}`)
      onPipelineAction()
    } catch (err) {
      notify('error', `Error: ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  function openLog(job) {
    setLogJob(job)
    setLogOpen(true)
  }

  // Group jobs by stage
  const stages = {}
  if (jobs) {
    for (const job of jobs) {
      if (!stages[job.stage]) stages[job.stage] = []
      stages[job.stage].push(job)
    }
  }

  // Extract commit message from pipeline (GitLab includes it in the pipeline object)
  // The commit msg typically contains the file name: "[DBUP] Agregar DBUP-1234_crear_tabla.sql"
  const commitMsg = pipeline.source === 'push'
    ? (jobs?.[0]?.commit?.message || pipeline.sha?.slice(0, 8) || '')
    : ''
  // Extract just the file name from commit message
  const fileName = commitMsg.match(/(?:Agregar|Actualizar|Eliminar)\s+(.+\.sql(?:\.tpl)?)/i)?.[1] || ''

  const canRetry  = ['failed', 'canceled', 'success'].includes(pipeline.status)
  const canCancel = ['running', 'pending', 'created'].includes(pipeline.status)

  return (
    <div className="border border-dbup-border rounded-lg overflow-hidden">
      {/* Pipeline header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-dbup-card hover:bg-dbup-border/30
                   cursor-pointer transition-colors select-none"
        onClick={toggleExpand}
        role="button"
        aria-expanded={expanded}
      >
        <span className="text-dbup-muted text-sm w-6 shrink-0 text-center">
          {loadingJobs ? <Spinner size="sm" /> : expanded ? '▼' : '▶'}
        </span>

        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          {/* Top line: status + ID + commit message */}
          <div className="flex items-center gap-3">
            <StatusBadge status={pipeline.status} />
            <span className="text-white font-mono text-sm">#{pipeline.id}</span>
            <span className="text-dbup-muted text-xs">{pipeline.ref}</span>
            {fileName && (
              <span className="text-xs text-dbup-teal font-mono truncate max-w-[200px]" title={fileName}>
                {fileName}
              </span>
            )}
          </div>

          {/* Bottom line: stage dots */}
          <StageDots jobs={jobs} />
        </div>

        {/* Right side: duration + date + actions */}
        <div className="flex items-center gap-4 shrink-0">
          <span className="text-xs text-dbup-muted hidden sm:block w-16 text-right">
            {duration(pipeline.started_at, pipeline.finished_at) || '—'}
          </span>
          <span className="text-xs text-dbup-muted hidden md:block w-36 text-right">
            {fmtDate(pipeline.created_at)}
          </span>
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            {canRetry && (
              <button onClick={() => handlePipelineAction('retry')}
                disabled={actionLoading === 'pipeline'}
                className="btn-secondary text-xs py-0.5 px-2" title="Reintentar pipeline">
                {actionLoading === 'pipeline' ? <Spinner size="sm" /> : '↻'}
              </button>
            )}
            {canCancel && (
              <button onClick={() => handlePipelineAction('cancel')}
                disabled={actionLoading === 'pipeline'}
                className="btn-danger text-xs py-0.5 px-2" title="Cancelar pipeline">
                ✕
              </button>
            )}
            <a href={`${project.web_url}/-/pipelines/${pipeline.id}`}
              target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
              className="btn-ghost text-xs py-0.5 px-2 text-dbup-muted" title="Abrir en GitLab">
              ↗
            </a>
          </div>
        </div>
      </div>

      {/* Expanded: jobs by stage */}
      {expanded && (
        <div className="border-t border-gitlab-border bg-gitlab-darker px-4 py-4 space-y-4">
          {jobs === null && !loadingJobs && (
            <p className="text-gitlab-muted text-sm">Cargando jobs...</p>
          )}
          {Object.entries(stages).map(([stage, stageJobs]) => (
            <div key={stage}>
              <div className="text-xs font-semibold text-gitlab-muted uppercase tracking-wide mb-2">
                Stage: {stage}
              </div>
              <div className="space-y-1.5">
                {stageJobs.map(job => (
                  <div key={job.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-gitlab-card border border-gitlab-border">
                    <StatusBadge status={job.status} size="sm" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white font-medium">{job.name}</span>
                      {job.started_at && (
                        <span className="text-xs text-gitlab-muted ml-2">
                          {duration(job.started_at, job.finished_at)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Log button */}
                      <button onClick={() => openLog(job)}
                        className="btn-ghost text-xs py-1 px-2"
                        title="Ver log">
                        📋 Log
                      </button>
                      {/* Action buttons */}
                      {jobActions(job).map(act => (
                        <button key={act.key}
                          onClick={() => handleJobAction(job, act.key)}
                          disabled={actionLoading === job.id}
                          className={`text-xs py-1 px-2 rounded flex items-center gap-1 transition-colors ${
                            act.variant === 'orange'
                              ? 'bg-gitlab-orange/15 text-gitlab-orange border border-gitlab-orange/30 hover:bg-gitlab-orange/30'
                              : act.variant === 'danger'
                              ? 'bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                              : 'btn-secondary'
                          }`}
                          title={act.label}>
                          {actionLoading === job.id ? <Spinner size="sm" /> : act.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Log modal */}
      <LogModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        job={logJob}
        project={project}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function Pipelines() {
  const { connectionStatus, projectMap, notify } = useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const isConnected = connectionStatus === 'connected'

  // Filters — read initial values from URL params
  const [env, setEnv]       = useState(searchParams.get('env') || ENVIRONMENTS[0])
  const [entity, setEntity] = useState(searchParams.get('entity') || ENTITIES[0])
  const [statusFilter, setStatusFilter] = useState('all')

  const [pipelines, setPipelines]   = useState([])
  const [loading, setLoading]       = useState(false)
  const [page, setPage]             = useState(1)
  const [hasMore, setHasMore]       = useState(false)
  const refreshTimer = useRef(null)

  const project = projectMap?.[env]?.[entity] ?? null
  const PER_PAGE = 15

  const loadPipelines = useCallback(async (pageNum = 1, append = false) => {
    if (!project) return
    setLoading(true)
    try {
      const data = await getPipelines(project.id, PER_PAGE * pageNum)
      const filtered = statusFilter === 'all'
        ? data
        : data.filter(p => p.status === statusFilter)
      setPipelines(append ? prev => [...prev, ...filtered.slice(-PER_PAGE)] : filtered)
      setHasMore(data.length === PER_PAGE * pageNum)
    } catch (err) {
      notify('error', `Error al cargar pipelines: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [project, notify, statusFilter])

  // Reload when env/entity/status changes
  useEffect(() => {
    setPage(1)
    setPipelines([])
    if (isConnected && project) loadPipelines(1)
    // Update URL params
    setSearchParams({ env, entity }, { replace: true })
  }, [env, entity, statusFilter, isConnected, project]) // eslint-disable-line

  // Auto-refresh
  useEffect(() => {
    if (!isConnected || !project) return
    refreshTimer.current = setInterval(() => loadPipelines(1), REFRESH_MS)
    return () => clearInterval(refreshTimer.current)
  }, [isConnected, project, loadPipelines])

  function loadMore() {
    const next = page + 1
    setPage(next)
    loadPipelines(next)
  }

  function handlePipelineAction() {
    setTimeout(() => loadPipelines(1), 2000)
  }

  // ---- Not connected ----
  if (!isConnected) {
    return (
      <div className="p-8 text-center text-gitlab-muted">
        <p>Conectate primero desde <a href="/config" className="text-gitlab-orange underline">Configuración</a>.</p>
      </div>
    )
  }

  const STATUS_OPTIONS = [
    { value: 'all',     label: 'Todos' },
    { value: 'success', label: 'Exitosos' },
    { value: 'failed',  label: 'Fallidos' },
    { value: 'running', label: 'Corriendo' },
    { value: 'manual',  label: 'Esperando' },
    { value: 'canceled',label: 'Cancelados' },
  ]

  const ENV_COLORS = {
    DEV: 'border-blue-500 text-blue-400 bg-blue-500/10',
    QA:  'border-yellow-500 text-yellow-400 bg-yellow-500/10',
    UAT: 'border-purple-500 text-purple-400 bg-purple-500/10',
  }

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 rounded-full" style={{ background: 'linear-gradient(180deg,#0de6b4,#cc27b0)' }} />
          <h1 className="page-title mb-0">Pipelines</h1>
        </div>
        <button
          onClick={() => loadPipelines(1)}
          disabled={loading}
          className="btn-secondary flex items-center gap-2 text-sm">
          {loading ? <Spinner size="sm" /> : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          Actualizar
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

          {/* Status filter */}
          <div>
            <label className="label text-xs">Estado</label>
            <select
              className="select text-sm py-1.5"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}>
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Repo info */}
          {project && (
            <div className="ml-auto text-right hidden md:block">
              <div className="text-xs text-gitlab-muted">Repo</div>
              <div className="text-xs text-gitlab-text truncate max-w-[200px]">{project.name}</div>
              <a href={`${project.web_url}/-/pipelines`} target="_blank" rel="noreferrer"
                className="text-xs text-gitlab-orange hover:underline">
                Ver en GitLab →
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Pipeline list */}
      {!project ? (
        <div className="card text-center py-10 text-gitlab-muted">
          Sin acceso al repo {env}/ENTIDAD{entity}. Verificá los permisos del token.
        </div>
      ) : loading && pipelines.length === 0 ? (
        <div className="flex items-center justify-center gap-3 py-16 text-gitlab-muted">
          <Spinner size="lg" /> Cargando pipelines...
        </div>
      ) : pipelines.length === 0 ? (
        <div className="card text-center py-10">
          <div className="text-3xl mb-3">🚀</div>
          <p className="text-gitlab-muted text-sm">Sin pipelines para este repo.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Column headers */}
          <div className="flex items-center gap-4 px-4 py-1 text-xs font-medium uppercase tracking-wide" style={{ color: '#7b85b0' }}>
            <div className="w-6" />
            <div className="flex-1">Pipeline / Archivo</div>
            <div className="w-16 text-right hidden sm:block">Duracion</div>
            <div className="w-36 text-right hidden md:block">Fecha</div>
            <div className="w-24 text-right">Acciones</div>
          </div>

          {pipelines.map(pipe => (
            <PipelineRow
              key={pipe.id}
              pipeline={pipe}
              project={project}
              notify={notify}
              onPipelineAction={handlePipelineAction}
            />
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="text-center pt-4">
              <button onClick={loadMore} disabled={loading}
                className="btn-secondary flex items-center gap-2 mx-auto">
                {loading ? <Spinner size="sm" /> : 'Cargar más pipelines'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
