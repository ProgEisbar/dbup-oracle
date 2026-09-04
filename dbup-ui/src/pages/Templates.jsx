/**
 * Templates — manage .sql.tpl files in DEV repos and trigger distribute:dev.
 *
 * Templates live in: templates/dev/<filename>.sql.tpl  (DEV repos only)
 * Each template declares:
 *   -- TARGET_ENTITIES: 700,701  or  -- TARGET_ENTITIES: all
 *   -- TARGET_SCHEMA: {{ENTIDAD}}
 *
 * Available substitution variables: {{ENTITY}}, {{ENTIDAD}}, {{PARAM}}, {{USER_SERVICES}}
 *
 * The distribute:dev job reads these templates and pushes rendered .sql files
 * to the shared/ folder of every target entity repo.
 */
import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext.jsx'
import Modal from '../components/Modal.jsx'
import Spinner from '../components/Spinner.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import {
  listTemplates,
  getFileContent,
  createFile,
  updateFile,
  deleteFile,
  getPipelines,
  getPipelineJobs,
  getJob,
  playJob,
  buildTemplatePath,
  ENTITIES,
  getRuntimeConfig,
  ticketExample,
  ticketPattern,
  ticketSearchPattern,
} from '../services/api.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const VAR_DOCS = [
  { variable: '{{ENTITY}}',        example: (entity) => entity,                 desc: 'Número de entidad' },
  { variable: '{{ENTIDAD}}',       example: (entity) => `ENTIDAD${entity}`,      desc: 'Schema ENTIDAD###' },
  { variable: '{{PARAM}}',         example: (entity) => `PARAM${entity}`,        desc: 'Schema PARAM###' },
  { variable: '{{USER_SERVICES}}', example: (entity) => `USER_SERVICES${entity}`, desc: 'Schema USER_SERVICES###' },
]
const ALLOWED_TEMPLATE_VARS = VAR_DOCS.map(v => v.variable)

function renderTemplatePreview(content, entity) {
  return content
    .split('{{ENTITY}}').join(entity)
    .split('{{ENTIDAD}}').join(`ENTIDAD${entity}`)
    .split('{{PARAM}}').join(`PARAM${entity}`)
    .split('{{USER_SERVICES}}').join(`USER_SERVICES${entity}`)
}

function findUnknownTemplateVars(content) {
  const matches = content.match(/\{\{[A-Z0-9_]+\}\}/g) ?? []
  return [...new Set(matches.filter(v => !ALLOWED_TEMPLATE_VARS.includes(v)))]
}

// ---------------------------------------------------------------------------
// TemplateCard — single template row in the list
// ---------------------------------------------------------------------------
function TemplateCard({ tpl, onEdit, onDelete }) {
  const [targetEntities, setTargetEntities] = useState([])
  const [ticket, setTicket]               = useState('')

  useEffect(() => {
    // Parse TARGET_ENTITIES and JIRA_TICKET from cached content
    if (tpl.content) {
      const teMatch  = tpl.content.match(/--\s*TARGET_ENTITIES\s*:\s*(.+)/i)
      const tktMatch = tpl.content.match(ticketSearchPattern())
      if (teMatch)  setTargetEntities(teMatch[1].trim().split(',').map(s => s.trim()))
      if (tktMatch) setTicket(tktMatch[0])
    }
  }, [tpl.content])

  return (
    <div className="card hover:border-gitlab-orange/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-mono text-sm font-medium truncate">{tpl.name}</span>
            {ticket && (
              <span className="code text-gitlab-muted text-xs">{ticket}</span>
            )}
          </div>
          <div className="text-xs text-gitlab-muted mt-1 font-mono truncate">{tpl.path}</div>

          {/* Target entities pills */}
          {targetEntities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {targetEntities.map(e => (
                <span key={e}
                  className="px-1.5 py-0.5 rounded text-xs bg-gitlab-orange/15 text-gitlab-orange border border-gitlab-orange/30 font-mono">
                  {e.toLowerCase() === 'all' ? 'ALL' : `ENTIDAD${e}`}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onEdit(tpl)} className="btn-ghost text-xs py-1 px-2">
            Editar
          </button>
          <button onClick={() => onDelete(tpl)}
            className="btn-ghost text-xs py-1 px-2 text-red-400 hover:text-red-300">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TemplateEditor modal — create or edit a .sql.tpl file
// ---------------------------------------------------------------------------
function TemplateEditor({ open, onClose, tpl, devProject, onSaved }) {
  const isEdit = !!tpl
  const appConfig = getRuntimeConfig()
  const [form, setForm] = useState(() => ({
    ticket: '',
    name: '',           // file name without .sql.tpl extension
    targetEntities: [...ENTITIES],   // selected entity numbers
    body: '',
    branch: appConfig.defaultBranch,
  }))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [previewEntity, setPreviewEntity] = useState(ENTITIES[0])

  // Load existing content when editing
  useEffect(() => {
    if (!open) return
    if (isEdit && tpl.content) {
      const lines = tpl.content
      const teMatch  = lines.match(/--\s*TARGET_ENTITIES\s*:\s*(.+)/i)
      const tktMatch = lines.match(ticketSearchPattern())
      const entities = teMatch
        ? (teMatch[1].trim().toLowerCase() === 'all'
            ? [...ENTITIES]
            : teMatch[1].split(',').map(s => s.trim()))
        : [...ENTITIES]
      // Strip header lines for body
      const bodyStart = lines.indexOf('\n\n')
      const body = bodyStart >= 0 ? lines.slice(bodyStart + 2) : lines
      setForm({
        ticket: tktMatch?.[0] ?? '',
        name: tpl.name.replace(/\.sql\.tpl$/, ''),
        targetEntities: entities,
        body,
        branch: appConfig.defaultBranch,
      })
      setPreviewEntity(entities[0] ?? ENTITIES[0])
    } else if (!isEdit) {
      setForm({ ticket: '', name: '', targetEntities: [...ENTITIES], body: '', branch: appConfig.defaultBranch })
      setPreviewEntity(ENTITIES[0])
    }
    setErrors({})
  }, [open, isEdit, tpl])

  useEffect(() => {
    if (!open || form.targetEntities.length === 0) return
    if (!form.targetEntities.includes(previewEntity)) {
      setPreviewEntity(form.targetEntities[0])
    }
  }, [open, form.targetEntities, previewEntity])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: undefined }))
  }

  function toggleEntity(entity) {
    setForm(f => ({
      ...f,
      targetEntities: f.targetEntities.includes(entity)
        ? f.targetEntities.filter(e => e !== entity)
        : [...f.targetEntities, entity],
    }))
  }

  function validate() {
    const e = {}
    const unknownVars = findUnknownTemplateVars(form.body)
    if (!ticketPattern().test(form.ticket)) e.ticket = `Formato inválido. Ejemplo: ${ticketExample()}`
    if (!form.name.trim()) e.name = 'Requerido'
    if (form.targetEntities.length === 0) e.targetEntities = 'Seleccioná al menos una entidad.'
    if (!form.body.trim()) e.body = 'El cuerpo del template no puede estar vacío.'
    if (unknownVars.length > 0) e.body = `Variables no soportadas: ${unknownVars.join(', ')}`
    return e
  }

  const entitiesLine = form.targetEntities.length === ENTITIES.length
    ? 'all'
    : form.targetEntities.join(',')
  const selectedPreviewEntity = form.targetEntities.includes(previewEntity)
    ? previewEntity
    : (form.targetEntities[0] ?? ENTITIES[0])
  const previewBody = form.body.trim()
    ? form.body
    : `CREATE OR REPLACE FUNCTION {{ENTIDAD}}.FN_EJEMPLO (p_val IN VARCHAR2)\nRETURN VARCHAR2 IS\nBEGIN\n  RETURN 'OK:{{ENTITY}}:' || p_val;\nEND;\n/`
  const previewTemplate = `-- JIRA_TICKET: ${form.ticket.toUpperCase() || ticketExample()}\n-- TARGET_ENTITIES: ${entitiesLine || selectedPreviewEntity}\n-- TARGET_SCHEMA: {{ENTIDAD}}\n\n${previewBody}`
  const renderedPreview = renderTemplatePreview(previewTemplate, selectedPreviewEntity)
  const unknownVars = findUnknownTemplateVars(form.body)

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    const header = `-- JIRA_TICKET: ${form.ticket.toUpperCase()}\n-- TARGET_ENTITIES: ${entitiesLine}\n-- TARGET_SCHEMA: {{ENTIDAD}}\n\n`
    const content = header + form.body
    const fileName = `${form.name.trim()}.sql.tpl`
    const filePath = buildTemplatePath(fileName)
    const commitMsg = isEdit
      ? `[DBUP] Actualizar template ${fileName}`
      : `[DBUP] Agregar template ${fileName}`

    setSaving(true)
    try {
      if (isEdit) {
        await updateFile(devProject.id,
          { filePath: tpl.path, content, commitMessage: commitMsg, branch: form.branch })
      } else {
        await createFile(devProject.id,
          { filePath, content, commitMessage: commitMsg, branch: form.branch })
      }
      onSaved(fileName)
      onClose()
    } catch (err) {
      setErrors({ submit: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Editar ${tpl?.name}` : 'Nueva Template'} size="lg">
      <div className="space-y-4">
        {/* Ticket + Name row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Ticket JIRA</label>
            <input type="text" className={`input font-mono ${errors.ticket ? 'border-red-500':''}`}
              placeholder={ticketExample()} value={form.ticket}
              onChange={e => set('ticket', e.target.value.toUpperCase())} />
            {errors.ticket && <p className="text-red-400 text-xs mt-1">{errors.ticket}</p>}
          </div>
          <div>
            <label className="label">Nombre del archivo <span className="text-gitlab-muted font-normal">(sin .sql.tpl)</span></label>
            <input type="text" className={`input font-mono ${errors.name ? 'border-red-500':''}`}
              placeholder={`${ticketExample()}_descripcion`} value={form.name}
              onChange={e => set('name', e.target.value)} disabled={isEdit} />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
          </div>
        </div>

        {/* Target entities */}
        <div>
          <label className="label">Entidades destino</label>
          <div className="flex gap-2 flex-wrap">
            {ENTITIES.map(e => (
            <label key={e} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer text-sm transition-colors ${
                form.targetEntities.includes(e)
                  ? 'border-gitlab-orange bg-gitlab-orange/10 text-white'
                  : 'border-gitlab-border text-gitlab-muted hover:border-gitlab-muted'}`}>
                <input type="checkbox" className="sr-only"
                  checked={form.targetEntities.includes(e)}
                  onChange={() => toggleEntity(e)} />
                ENTIDAD{e}
              </label>
            ))}
            <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer text-sm transition-colors ${
              form.targetEntities.length === ENTITIES.length
                ? 'border-green-500 bg-green-500/10 text-green-400'
                : 'border-gitlab-border text-gitlab-muted hover:border-gitlab-muted'}`}>
              <input type="checkbox" className="sr-only"
                checked={form.targetEntities.length === ENTITIES.length}
                onChange={() => set('targetEntities', form.targetEntities.length === ENTITIES.length ? [] : [...ENTITIES])} />
              Todas (all)
            </label>
          </div>
          {errors.targetEntities && <p className="text-red-400 text-xs mt-1">{errors.targetEntities}</p>}
        </div>

        {/* Variables reference */}
        <details className="group">
          <summary className="text-xs text-gitlab-muted cursor-pointer hover:text-gitlab-text select-none">
            Variables disponibles ▾
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-1">
            {VAR_DOCS.map(v => (
              <div key={v.variable} className="flex items-center gap-2 text-xs p-1.5 rounded-md bg-gitlab-darker border border-gitlab-border">
                <code className="text-gitlab-orange font-mono">{v.variable}</code>
                <span className="text-gitlab-muted">→ {renderTemplatePreview(v.variable, selectedPreviewEntity)}</span>
              </div>
            ))}
          </div>
        </details>

        {/* SQL body */}
        <div>
          <label className="label">Contenido SQL <span className="text-gitlab-muted font-normal">(usá las variables arriba)</span></label>
          <textarea className={`input font-mono text-sm resize-none h-56 ${errors.body ? 'border-red-500':''}`}
            placeholder={`CREATE OR REPLACE FUNCTION {{ENTIDAD}}.FN_EJEMPLO (p_val IN VARCHAR2)\nRETURN VARCHAR2 IS\nBEGIN\n  RETURN 'OK:{{ENTITY}}:' || p_val;\nEND;\n/`}
            value={form.body} onChange={e => set('body', e.target.value)} spellCheck={false} />
          {errors.body && <p className="text-red-400 text-xs mt-1">{errors.body}</p>}
          {unknownVars.length > 0 && !errors.body && (
            <p className="text-yellow-400 text-xs mt-1">
              Variables no soportadas detectadas: {unknownVars.join(', ')}
            </p>
          )}
        </div>

        {/* Rendered preview */}
        <div className="rounded-lg border border-gitlab-border bg-gitlab-darker overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-gitlab-border">
            <label className="label mb-0">Vista previa de variables</label>
            <div className="flex gap-1 flex-wrap justify-end">
              {(form.targetEntities.length > 0 ? form.targetEntities : ENTITIES).map(e => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setPreviewEntity(e)}
                  className={`px-2 py-1 rounded-md border text-xs font-mono transition-colors ${
                    selectedPreviewEntity === e
                      ? 'border-gitlab-orange bg-gitlab-orange/10 text-white'
                      : 'border-gitlab-border text-gitlab-muted hover:border-gitlab-muted'
                  }`}>
                  ENTIDAD{e}
                </button>
              ))}
            </div>
          </div>
          <pre className="max-h-56 overflow-auto p-3 text-xs text-gitlab-text font-mono whitespace-pre-wrap">
{renderedPreview}
          </pre>
        </div>

        {errors.submit && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {errors.submit}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary flex items-center gap-2" onClick={handleSave} disabled={saving}>
            {saving ? <><Spinner size="sm" /> Guardando...</> : isEdit ? 'Guardar cambios' : 'Crear template'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// DistributePanel — shows distribute:dev job status and lets user trigger it
// ---------------------------------------------------------------------------
function DistributePanel({ devProject, notify }) {
  const appConfig = getRuntimeConfig()
  const [pipeline, setPipeline]   = useState(null)
  const [jobs, setJobs]           = useState([])
  const [loading, setLoading]     = useState(false)
  const [playing, setPlaying]     = useState(false)

  const load = useCallback(async () => {
    if (!devProject) return
    setLoading(true)
    try {
      const pipes = await getPipelines(devProject.id, 5)
      // Find the most recent pipeline that has a distribute job
      for (const pipe of pipes) {
        const j = await getPipelineJobs(devProject.id, pipe.id)
        const distributeJob = j.find(job => job.name === appConfig.distributeJobName)
        if (distributeJob) {
          setPipeline(pipe)
          setJobs(j)
          break
        }
      }
    } catch (err) {
      notify('error', `Error al cargar pipelines: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [devProject, notify])

  useEffect(() => { load() }, [load])

  async function handlePlay(jobId, jobName) {
    setPlaying(true)
    try {
      const freshJob = await getJob(devProject.id, jobId)
      if (freshJob.status !== 'manual' && freshJob.status !== 'created') {
        notify('info', `El job "${jobName}" ya no se puede ejecutar porque está en estado ${freshJob.status}. Actualizando estado...`)
        await load()
        return
      }
      await playJob(devProject.id, jobId)
      notify('success', `Job "${jobName}" iniciado`)
      setTimeout(load, 2500)
    } catch (err) {
      notify('error', `No se pudo iniciar: ${err.message}`)
    } finally {
      setPlaying(false)
    }
  }

  const distributeJob = jobs.find(j => j.name === appConfig.distributeJobName)

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold text-sm">Distribuir templates</h3>
        <button onClick={load} disabled={loading} className="btn-ghost text-xs py-1 px-2" aria-label="Actualizar estado">
          {loading ? <Spinner size="sm" /> : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
        </button>
      </div>

      <p className="text-xs text-gitlab-muted mb-4">
        El job <code className="code">{appConfig.distributeJobName}</code> lee las templates y copia los archivos
        .sql renderizados a la carpeta <code className="code">{appConfig.ddlRoot}/{appConfig.sharedFolder}/</code> de cada
        entidad destino.
      </p>

      {loading && !pipeline ? (
        <div className="flex items-center gap-2 text-gitlab-muted text-sm">
          <Spinner size="sm" /> Buscando jobs...
        </div>
      ) : distributeJob ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <StatusBadge status={distributeJob.status} />
              <span className="text-gitlab-text font-mono">{distributeJob.name}</span>
            </div>
            {(distributeJob.status === 'manual' || distributeJob.status === 'created') && (
              <button
                onClick={() => handlePlay(distributeJob.id, distributeJob.name)}
                disabled={playing}
                className="btn-primary text-xs flex items-center gap-1.5">
                {playing ? <Spinner size="sm" /> : (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                    <path d="M6.3 4.2v11.6L15 10 6.3 4.2z" />
                  </svg>
                )}
                Ejecutar distribute
              </button>
            )}
            {distributeJob.status === 'success' && (
              <span className="text-xs text-green-400">Completado exitosamente</span>
            )}
            {distributeJob.status === 'failed' && (
              <button onClick={() => handlePlay(distributeJob.id, distributeJob.name)}
                disabled={playing}
                className="btn-danger text-xs flex items-center gap-1.5">
                {playing ? <Spinner size="sm" /> : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                Reintentar
              </button>
            )}
          </div>
          {pipeline && (
            <div className="text-xs text-gitlab-muted">
              Pipeline #{pipeline.id} · {pipeline.ref} ·{' '}
              <a href={`${devProject.web_url}/-/pipelines/${pipeline.id}`}
                target="_blank" rel="noreferrer"
                className="text-gitlab-orange hover:underline">
                Ver en GitLab
              </a>
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-gitlab-muted italic">
          No se encontró el job {appConfig.distributeJobName} en los pipelines recientes.
          El job aparece automáticamente cuando hay cambios en <code className="code">{appConfig.templateRoot}/</code>.
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function Templates() {
  const { connectionStatus, projectMap, notify } = useApp()
  const isConnected = connectionStatus === 'connected'
  const appConfig = getRuntimeConfig()

  const devProject = projectMap?.[appConfig.templateEnvironment]?.[appConfig.templateEntity] ?? null

  const [templates, setTemplates]         = useState([])
  const [loadingList, setLoadingList]     = useState(false)
  const [editorOpen, setEditorOpen]       = useState(false)
  const [editingTpl, setEditingTpl]       = useState(null)  // null = new
  const [deleteTarget, setDeleteTarget]   = useState(null)
  const [deletingName, setDeletingName]   = useState(null)

  const loadTemplates = useCallback(async () => {
    if (!devProject) return
    setLoadingList(true)
    try {
      const list = await listTemplates(devProject.id)
      // Load content for each template (small files, ok to fetch all)
      const withContent = await Promise.all(
        list.map(async (tpl) => {
          try {
            const f = await getFileContent(devProject.id, tpl.path)
            return { ...tpl, content: f.content }
          } catch {
            return tpl
          }
        })
      )
      setTemplates(withContent)
    } catch (err) {
      notify('error', `Error al cargar templates: ${err.message}`)
    } finally {
      setLoadingList(false)
    }
  }, [devProject, notify])

  useEffect(() => {
    if (isConnected && devProject) loadTemplates()
  }, [isConnected, devProject]) // eslint-disable-line

  function handleEdit(tpl) {
    setEditingTpl(tpl)
    setEditorOpen(true)
  }

  function handleNew() {
    setEditingTpl(null)
    setEditorOpen(true)
  }

  function handleEditorClose() {
    setEditorOpen(false)
    setEditingTpl(null)
  }

  function handleSaved(fileName) {
    notify('success', `Template "${fileName}" guardada`)
    loadTemplates()
  }

  function handleDeleteRequest(tpl) {
    setDeleteTarget(tpl)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeletingName(deleteTarget.name)
    try {
      await deleteFile(devProject.id, {
        filePath: deleteTarget.path,
        commitMessage: `[DBUP] Eliminar template ${deleteTarget.name}`,
      })
      notify('success', `Template "${deleteTarget.name}" eliminada`)
      setDeleteTarget(null)
      loadTemplates()
    } catch (err) {
      notify('error', `No se pudo eliminar: ${err.message}`)
    } finally {
      setDeletingName(null)
    }
  }

  // ---- Render: not connected ----
  if (!isConnected) {
    return (
      <div className="p-8 text-center text-gitlab-muted">
        <p>Conectate primero desde <a href="/config" className="text-gitlab-orange underline">Configuración</a>.</p>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: 'linear-gradient(180deg,#0de6b4,#cc27b0)' }} />
            <h1 className="page-title mb-0">Templates</h1>
          </div>
          <p className="text-xs text-dbup-muted ml-4">
            Archivos <code className="code">.sql.tpl</code> en{' '}
            <code className="code">{appConfig.templateRoot}/</code> del repo{' '}
            {appConfig.templateEnvironment}/{appConfig.projectPrefix.toUpperCase()}{appConfig.templateEntity}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadTemplates} disabled={loadingList} className="btn-secondary text-sm flex items-center gap-1.5">
            {loadingList ? <Spinner size="sm" /> : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Actualizar
          </button>
          <button onClick={handleNew} className="btn-primary text-sm flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva template
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        {/* Template list */}
        <div className="space-y-3 min-w-0">
          <h2 className="section-title">Templates existentes</h2>

          {loadingList ? (
            <div className="flex items-center gap-2 text-gitlab-muted py-8 justify-center">
              <Spinner /> Cargando templates...
            </div>
          ) : templates.length === 0 ? (
            <div className="card text-center py-10 text-gitlab-muted">
              <div className="w-12 h-12 mx-auto mb-3 rounded-lg border border-gitlab-border bg-gitlab-darker flex items-center justify-center">
                <svg className="w-6 h-6 text-gitlab-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M8 7h8M8 11h8m-8 4h5M6 3h9l3 3v15H6V3z" />
                </svg>
              </div>
              <p className="text-sm">No hay templates todavía.</p>
              <button onClick={handleNew} className="btn-primary text-sm mt-4">
                Crear la primera template
              </button>
            </div>
          ) : (
            templates.map((tpl) => (
              <TemplateCard
                key={tpl.path}
                tpl={tpl}
                onEdit={handleEdit}
                onDelete={handleDeleteRequest}
              />
            ))
          )}
        </div>

        {/* Side panel: distribute + info */}
        <aside className="space-y-4 xl:sticky xl:top-8 min-w-0">
          <DistributePanel
            devProject={devProject}
            notify={notify}
          />

          {/* Variables reference card */}
          <div className="card">
            <h3 className="text-white font-semibold text-sm mb-3">Variables de sustitución</h3>
            <div className="space-y-2">
              {VAR_DOCS.map(v => (
                <div key={v.variable} className="text-xs">
                  <code className="text-gitlab-orange font-mono">{v.variable}</code>
                  <span className="text-gitlab-muted ml-1">→ {v.example(ENTITIES[0])}</span>
                  <div className="text-gitlab-muted/70">{v.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Repo link */}
          {devProject && (
            <div className="card text-xs space-y-1">
              <div className="text-gitlab-muted font-medium">Repo de templates</div>
              <div className="text-gitlab-text truncate">{devProject.path_with_namespace}</div>
              <a href={`${devProject.web_url}/-/tree/${appConfig.defaultBranch}/${appConfig.templateRoot}`}
                target="_blank" rel="noreferrer"
                className="text-gitlab-orange hover:underline">
                Ver en GitLab
              </a>
            </div>
          )}
        </aside>
      </div>

      {/* Editor modal */}
      <TemplateEditor
        open={editorOpen}
        onClose={handleEditorClose}
        tpl={editingTpl}
        devProject={devProject}
        onSaved={handleSaved}
      />

      {/* Delete confirm modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar template"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gitlab-text text-sm">
            ¿Eliminar <code className="code">{deleteTarget?.name}</code>?
            Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setDeleteTarget(null)}
              disabled={!!deletingName}>
              Cancelar
            </button>
            <button className="btn-danger flex items-center gap-2" onClick={confirmDelete}
              disabled={!!deletingName}>
              {deletingName ? <><Spinner size="sm" /> Eliminando...</> : 'Eliminar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
