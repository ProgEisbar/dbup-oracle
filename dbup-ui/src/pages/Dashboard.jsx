/**
 * Dashboard — pipeline status matrix (3 environments × 4 entities)
 * plus quick-action shortcuts and recent activity feed.
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Spinner from '../components/Spinner.jsx'
import {
  getPipelineStatusMatrix,
  getPipelineJobs,
  playJob,
  ENVIRONMENTS,
  ENTITIES,
  getRuntimeConfig,
  ticketExample,
} from '../services/api.js'

// How often to auto-refresh (ms)
const REFRESH_INTERVAL = 30_000

// Color classes per environment — application color palette
const ENV_COLORS = {
  DEV: {
    label: 'border-dbup-teal/50 text-dbup-teal',
    header: 'text-dbup-teal',
    ring: 'ring-dbup-teal/30',
    style: { background: 'rgba(13,230,180,0.08)', borderColor: 'rgba(13,230,180,0.3)', color: '#0de6b4' },
  },
  QA: {
    label: 'border-yellow-500/50 text-yellow-300',
    header: 'text-yellow-300',
    ring: 'ring-yellow-500/30',
    style: { background: 'rgba(234,179,8,0.08)', borderColor: 'rgba(234,179,8,0.3)', color: '#fde047' },
  },
  UAT: {
    label: 'border-dbup-magenta/50',
    header: '',
    ring: 'ring-dbup-magenta/30',
    style: { background: 'rgba(204,39,176,0.08)', borderColor: 'rgba(204,39,176,0.3)', color: '#cc27b0' },
  },
}

function fmt(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function elapsed(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'hace un momento'
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs} h`
  return `hace ${Math.floor(hrs / 24)} d`
}

// ---------------------------------------------------------------------------
// Sub-component: single pipeline cell in the matrix
// ---------------------------------------------------------------------------
function PipelineCell({ env, entity, pipeline, project, onQuickPlay }) {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState(null)
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const envColor = ENV_COLORS[env] || ENV_COLORS.DEV

  async function toggleExpand() {
    if (!pipeline) return
    if (!expanded && !jobs) {
      setLoadingJobs(true)
      try {
        const j = await getPipelineJobs(project.id, pipeline.id)
        setJobs(j)
      } catch {
        // ignore
      } finally {
        setLoadingJobs(false)
      }
    }
    setExpanded((v) => !v)
  }

  const manualJobs = jobs?.filter(
    (j) => j.status === 'manual' || j.status === 'created'
  ) ?? []

  return (
    <div
      className={`card hover:border-gitlab-muted transition-colors ${
        expanded ? `ring-1 ${envColor.ring}` : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className="text-xs font-mono font-semibold text-white">
            ENTIDAD{entity}
          </span>
          {project ? (
            <a
              href={project.web_url}
              target="_blank"
              rel="noreferrer"
              className="block text-xs text-gitlab-muted hover:text-gitlab-orange transition-colors truncate max-w-[140px]"
              title={project.path_with_namespace}
            >
              {project.name}
            </a>
          ) : (
            <span className="block text-xs text-gitlab-muted italic">Sin acceso</span>
          )}
        </div>
        {pipeline && (
          <StatusBadge status={pipeline.status} size="sm" />
        )}
      </div>

      {pipeline ? (
        <>
          <div className="text-xs text-gitlab-muted mt-1 space-y-0.5">
            <div className="flex justify-between">
              <span>Pipeline #{pipeline.id}</span>
              <span>{elapsed(pipeline.created_at)}</span>
            </div>
            <div className="text-gitlab-text/60 truncate">{fmt(pipeline.created_at)}</div>
          </div>

          <div className="flex items-center gap-1 mt-3">
            <button
              onClick={() =>
                navigate(`/pipelines?env=${env}&entity=${entity}`)
              }
              className="btn-secondary text-xs py-1 px-2 flex-1"
              title="Ver pipelines"
            >
              Ver pipelines
            </button>
            <button
              onClick={toggleExpand}
              className="btn-ghost text-xs py-1 px-2"
              title={expanded ? 'Ocultar jobs' : 'Ver jobs'}
              disabled={loadingJobs}
            >
              {loadingJobs ? <Spinner size="sm" /> : expanded ? '▲' : '▼'}
            </button>
          </div>

          {/* Expanded job list */}
          {expanded && jobs && (
            <div className="mt-3 space-y-1 border-t border-gitlab-border pt-3">
              {jobs.length === 0 ? (
                <p className="text-xs text-gitlab-muted">Sin jobs.</p>
              ) : (
                jobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <StatusBadge status={job.status} size="sm" />
                      <span className="text-xs text-gitlab-text truncate">{job.name}</span>
                    </div>
                    {(job.status === 'manual' || job.status === 'created') && (
                      <button
                        onClick={() => onQuickPlay(project.id, job.id, job.name, entity)}
                        className="shrink-0 text-xs px-2 py-0.5 rounded bg-gitlab-orange/15 text-gitlab-orange
                                   hover:bg-gitlab-orange/30 transition-colors border border-gitlab-orange/30"
                        title={`Ejecutar ${job.name}`}
                      >
                        ▶ Play
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      ) : project ? (
        <div className="text-xs text-gitlab-muted mt-2 italic">Sin pipelines todavía</div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: quick stats bar
// ---------------------------------------------------------------------------
function StatsBar({ matrix }) {
  const counts = { success: 0, failed: 0, running: 0, manual: 0, other: 0 }
  for (const env of ENVIRONMENTS) {
    for (const entity of ENTITIES) {
      const p = matrix?.[env]?.[entity]
      if (!p) continue
      const s = p.status
      if (s === 'success') counts.success++
      else if (s === 'failed') counts.failed++
      else if (s === 'running' || s === 'pending') counts.running++
      else if (s === 'manual') counts.manual++
      else counts.other++
    }
  }

  const stats = [
    { label: 'Exitosos', value: counts.success, color: 'text-green-400' },
    { label: 'Fallidos', value: counts.failed, color: 'text-red-400' },
    { label: 'Corriendo', value: counts.running, color: 'text-blue-400' },
    { label: 'Esperando aprobación', value: counts.manual, color: 'text-purple-400' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
      {stats.map((s) => (
        <div key={s.label} className="card text-center">
          <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
          <div className="text-xs text-gitlab-muted mt-1">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function Dashboard() {
  const { connectionStatus, projectMap, notify } = useApp()
  const navigate = useNavigate()

  const [matrix, setMatrix] = useState(null)
  const [loading, setLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [playingJob, setPlayingJob] = useState(null) // { projectId, jobId }

  const isConnected = connectionStatus === 'connected'

  const loadMatrix = useCallback(async () => {
    if (!projectMap) return
    setLoading(true)
    try {
      const m = await getPipelineStatusMatrix(projectMap)
      setMatrix(m)
      setLastRefresh(new Date())
    } catch (err) {
      notify('error', `Error al cargar pipelines: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [projectMap, notify])

  // Initial load
  useEffect(() => {
    if (isConnected && projectMap) loadMatrix()
  }, [isConnected, projectMap]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh
  useEffect(() => {
    if (!isConnected || !projectMap) return
    const t = setInterval(loadMatrix, REFRESH_INTERVAL)
    return () => clearInterval(t)
  }, [isConnected, projectMap, loadMatrix])

  async function handleQuickPlay(projectId, jobId, jobName, entity) {
    if (playingJob) return
    setPlayingJob({ projectId, jobId })
    try {
      const variables = []
      const appConfig = getRuntimeConfig()
      if (jobName.startsWith(`${appConfig.rollbackJobPrefix}:`)) {
        const rollbackScript = window.prompt(
          `Ruta del rollback a ejecutar (relativa a ${appConfig.rollbackRoot}):`,
          `${appConfig.sharedFolder}/${appConfig.schemaTypes[0]}${entity}/${ticketExample()}_descripcion_rollback.sql`
        )
        if (!rollbackScript) return
        variables.push({ key: 'DBUP_ROLLBACK_SCRIPT', value: rollbackScript.trim() })
      }
      await playJob(projectId, jobId, variables)
      notify('success', `Job "${jobName}" iniciado`)
      setTimeout(loadMatrix, 2000)
    } catch (err) {
      notify('error', `No se pudo iniciar el job: ${err.message}`)
    } finally {
      setPlayingJob(null)
    }
  }

  // ---- Render: not connected ----
  if (!isConnected) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 bg-gitlab-card border border-gitlab-border rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gitlab-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <h2 className="text-white font-semibold text-lg mb-2">Sin conexión</h2>
        <p className="text-gitlab-muted text-sm mb-6 max-w-sm">
          Configurá tu token de GitLab para empezar a ver el estado de los pipelines.
        </p>
        <button className="btn-primary" onClick={() => navigate('/config')}>
          Ir a Configuración
        </button>
      </div>
    )
  }

  // ---- Render: connected ----
  return (
    <div className="page-shell">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: 'linear-gradient(180deg,#0de6b4,#cc27b0)' }} />
            <h1 className="page-title mb-0">Dashboard</h1>
          </div>
          {lastRefresh && (
            <p className="text-xs text-gitlab-muted">
              Última actualización: {lastRefresh.toLocaleTimeString('es-AR')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadMatrix}
            disabled={loading}
            className="btn-secondary flex items-center gap-2 text-sm"
            title="Actualizar ahora"
          >
            {loading ? (
              <Spinner size="sm" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Actualizar
          </button>
          <button
            onClick={() => navigate('/new-script')}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo Script
          </button>
        </div>
      </div>

      {/* Stats */}
      {matrix && <StatsBar matrix={matrix} />}

      {/* Matrix: one section per environment */}
      {loading && !matrix ? (
        <div className="flex items-center justify-center py-20 gap-3 text-gitlab-muted">
          <Spinner size="lg" />
          <span>Cargando estado de pipelines...</span>
        </div>
      ) : (
        <div className="space-y-8">
          {ENVIRONMENTS.map((env) => {
            const envColor = ENV_COLORS[env] || ENV_COLORS.DEV
            return (
              <section key={env}>
                {/* Environment header */}
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className="px-3 py-1 rounded-md text-sm font-bold border"
                    style={envColor.style}
                  >
                    {env}
                  </span>
                  <div className="flex-1 h-px bg-gitlab-border" />
                  <button
                    onClick={() => navigate(`/pipelines?env=${env}`)}
                    className="text-xs text-gitlab-muted hover:text-gitlab-orange transition-colors"
                  >
                    Ver todos los pipelines →
                  </button>
                </div>

                {/* Entity grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {ENTITIES.map((entity) => {
                    const project = projectMap?.[env]?.[entity]
                    const pipeline = matrix?.[env]?.[entity]
                    return (
                      <PipelineCell
                        key={entity}
                        env={env}
                        entity={entity}
                        pipeline={pipeline}
                        project={project}
                        onQuickPlay={handleQuickPlay}
                      />
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* Quick actions */}
      <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <QuickActionCard
          title="Nuevo Script DDL"
          description="Subí un script .sql a cualquier ambiente y entidad."
          icon="script"
          onClick={() => navigate('/new-script')}
        />
        <QuickActionCard
          title="Templates"
          description="Gestioná plantillas .sql.tpl y distribuí a todas las entidades."
          icon="template"
          onClick={() => navigate('/templates')}
        />
        <QuickActionCard
          title="Historial"
          description="Explorá los scripts existentes en cada repo."
          icon="history"
          onClick={() => navigate('/history')}
        />
      </div>
    </div>
  )
}

function QuickActionCard({ title, description, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      className="card text-left transition-all group"
      style={{ border: '1px solid #2a3260' }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(13,230,180,0.5)'
        e.currentTarget.style.background = 'rgba(13,230,180,0.05)'
        e.currentTarget.style.boxShadow = '0 0 20px rgba(13,230,180,0.1)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = '#2a3260'
        e.currentTarget.style.background = '#1e2547'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div className="w-9 h-9 mb-3 rounded-lg border border-gitlab-border bg-gitlab-darker flex items-center justify-center text-dbup-teal">
        <QuickActionIcon type={icon} />
      </div>
      <div className="font-bold text-white text-sm mb-1 group-hover:text-dbup-teal transition-colors" style={{}}>
        {title}
      </div>
      <div className="text-xs text-dbup-muted">{description}</div>
    </button>
  )
}

function QuickActionIcon({ type }) {
  if (type === 'template') {
    return (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    )
  }
  if (type === 'history') {
    return (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M12 8v4l3 2m6-2a9 9 0 11-3.1-6.8M21 3v5h-5" />
      </svg>
    )
  }
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M9 12h6m-6 4h6M7 3h7l4 4v14H7V3z" />
    </svg>
  )
}
