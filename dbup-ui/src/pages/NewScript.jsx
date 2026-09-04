/**
 * NewScript — guided form to create and upload a DDL script to the correct repo.
 *
 * Flow:
 *   1. Select environment (DEV | QA | UAT) and folder type (specific env | shared)
 *   2. Select entity (700–703) and schema type (ENTIDAD | PARAM)
 *   3. Enter JIRA ticket and short description → auto-generates file name
 *   4. Write / paste SQL body (pre-filled with correct headers)
 *   5. Preview generated file path and content
 *   6. Submit → creates file via GitLab API → shows result with link
 */
import { useState, useEffect, useMemo } from 'react'
import { useApp } from '../context/AppContext.jsx'
import Spinner from '../components/Spinner.jsx'
import {
  buildDdlPath,
  buildDdlFileName,
  generateDdlContent,
  createFile,
  fileExists,
  ENTITIES,
  ENVIRONMENTS,
  SCHEMA_TYPES,
  getRuntimeConfig,
  ticketExample,
  ticketPattern,
} from '../services/api.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
// File name slug: only alphanum + underscore
function slugify(str) {
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 60)
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------
function StepIndicator({ current, steps }) {
  return (
    <ol className="flex items-center gap-2 mb-8 text-xs" aria-label="Pasos del formulario">
      {steps.map((label, idx) => {
        const num = idx + 1
        const done = num < current
        const active = num === current
        return (
          <li key={num} className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center font-bold shrink-0 transition-colors ${
                done
                  ? 'bg-green-500 text-white'
                  : active
                  ? 'bg-gitlab-orange text-white'
                  : 'bg-gitlab-card border border-gitlab-border text-gitlab-muted'
              }`}
            >
              {done ? '✓' : num}
            </span>
            <span
              className={`hidden sm:inline transition-colors ${
                active ? 'text-white font-medium' : done ? 'text-green-400' : 'text-gitlab-muted'
              }`}
            >
              {label}
            </span>
            {idx < steps.length - 1 && (
              <span className="flex-1 h-px bg-gitlab-border mx-1 w-4 sm:w-8" aria-hidden />
            )}
          </li>
        )
      })}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Preview panel
// ---------------------------------------------------------------------------
function PreviewPanel({ filePath, content }) {
  return (
    <div className="card bg-gitlab-darker border-gitlab-border">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-gitlab-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="text-xs text-gitlab-muted font-mono break-all">{filePath || '—'}</span>
      </div>
      <pre className="text-xs font-mono text-gitlab-text whitespace-pre-wrap bg-gitlab-darker rounded p-3 border border-gitlab-border max-h-64 overflow-y-auto">
        {content || '— completá el formulario para ver la vista previa —'}
      </pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function NewScript() {
  const { connectionStatus, projectMap, notify } = useApp()
  const isConnected = connectionStatus === 'connected'
  const appConfig = getRuntimeConfig()
  const envFolders = [
    { value: 'env', label: `Ambiente específico (${ENVIRONMENTS.map((item) => item.toLowerCase()).join(' / ')})` },
    { value: 'shared', label: `${appConfig.sharedFolder} (todos los ambientes)` },
  ]

  // Form state
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(() => ({
    environment: ENVIRONMENTS[0],
    folderType: 'env',   // 'env' | 'shared'
    entity: ENTITIES[0],
    schemaType: SCHEMA_TYPES[0],
    ticket: '',
    description: '',
    body: '',
    branch: appConfig.defaultBranch,
  }))

  // UI state
  const [submitting, setSubmitting] = useState(false)
  const [checkingExists, setCheckingExists] = useState(false)
  const [alreadyExists, setAlreadyExists] = useState(false)
  const [result, setResult] = useState(null) // { success, fileUrl, filePath, pipelineUrl }
  const [errors, setErrors] = useState({})

  // Derived values
  const fileName = useMemo(() => {
    if (!form.ticket || !form.description) return ''
    return buildDdlFileName(form.ticket.toUpperCase(), form.description)
  }, [form.ticket, form.description])

  const envFolder = form.folderType === 'shared' ? appConfig.sharedFolder : form.environment
  const filePath = useMemo(() => {
    if (!fileName) return ''
    return buildDdlPath(envFolder, form.entity, form.schemaType, fileName)
  }, [fileName, envFolder, form.entity, form.schemaType])

  const fullContent = useMemo(() => {
    const ticket = form.ticket.toUpperCase()
    const base = generateDdlContent(ticket, form.schemaType, form.entity, '')
    return base + (form.body || `-- Escribí tu DDL aquí\n`)
  }, [form.ticket, form.schemaType, form.entity, form.body])

  const project = projectMap?.[form.environment]?.[form.entity] ?? null

  // Check if file already exists when path is ready
  useEffect(() => {
    if (!filePath || !project) {
      setAlreadyExists(false)
      return
    }
    let cancelled = false
    setCheckingExists(true)
    fileExists(project.id, filePath, form.branch)
      .then((exists) => { if (!cancelled) setAlreadyExists(exists) })
      .catch(() => { if (!cancelled) setAlreadyExists(false) })
      .finally(() => { if (!cancelled) setCheckingExists(false) })
    return () => { cancelled = true }
  }, [filePath, project, form.branch])

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  // ---------------------------------------------------------------------------
  // Validation per step
  // ---------------------------------------------------------------------------
  function validateStep1() {
    const e = {}
    if (!form.environment) e.environment = 'Seleccioná un ambiente.'
    if (!form.entity) e.entity = 'Seleccioná una entidad.'
    return e
  }

  function validateStep2() {
    const e = {}
    if (!ticketPattern().test(form.ticket)) e.ticket = `Formato inválido. Ejemplo: ${ticketExample()}`
    if (!form.description || slugify(form.description).length < 3)
      e.description = 'Descripción muy corta (mínimo 3 caracteres alfanuméricos).'
    return e
  }

  function validateStep3() {
    const e = {}
    if (!form.body.trim()) e.body = 'El contenido SQL no puede estar vacío.'
    return e
  }

  function goNext() {
    const validators = [null, validateStep1, validateStep2, validateStep3]
    const errs = validators[step]?.() ?? {}
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})
    setStep((s) => s + 1)
  }

  function goBack() {
    setErrors({})
    setStep((s) => s - 1)
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------
  async function handleSubmit(e) {
    e.preventDefault()
    if (!project) {
      notify('error', 'No hay acceso al proyecto para este ambiente/entidad.')
      return
    }
    if (alreadyExists) {
      notify('error', 'El archivo ya existe en el repo. Cambiá el ticket o la descripción.')
      return
    }

    setSubmitting(true)
    try {
      const ticket = form.ticket.toUpperCase()
      const commitMsg = `[DBUP] Agregar ${fileName} (${ticket})`
      await createFile(project.id, {
        filePath,
        content: fullContent,
        commitMessage: commitMsg,
        branch: form.branch,
      })

      const fileUrl = `${project.web_url}/-/blob/${form.branch}/${filePath}`
      const pipelineUrl = `${project.web_url}/-/pipelines`
      setResult({ success: true, fileUrl, filePath, pipelineUrl })
      notify('success', `Script ${fileName} subido exitosamente`)
    } catch (err) {
      notify('error', `Error al subir el archivo: ${err.message}`)
      setResult({ success: false, error: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  function handleReset() {
    setForm({
      environment: ENVIRONMENTS[0],
      folderType: 'env',
      entity: ENTITIES[0],
      schemaType: SCHEMA_TYPES[0],
      ticket: '',
      description: '',
      body: '',
      branch: appConfig.defaultBranch,
    })
    setStep(1)
    setResult(null)
    setErrors({})
    setAlreadyExists(false)
  }

  // ---------------------------------------------------------------------------
  // Render: not connected
  // ---------------------------------------------------------------------------
  if (!isConnected) {
    return (
      <div className="p-8 text-center text-gitlab-muted">
        <p>Conectate primero desde <a href="/config" className="text-gitlab-orange underline">Configuración</a>.</p>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: success result
  // ---------------------------------------------------------------------------
  if (result?.success) {
    return (
      <div className="page-shell max-w-3xl">
        <div className="card text-center space-y-4 py-10">
          <div className="text-5xl">✅</div>
          <h2 className="text-white text-xl font-bold">Script subido exitosamente</h2>
          <p className="text-gitlab-muted text-sm font-mono break-all">{result.filePath}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-4">
            <a
              href={result.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary text-sm"
            >
              Ver archivo en GitLab →
            </a>
            <a
              href={result.pipelineUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary text-sm"
            >
              Ver pipelines →
            </a>
            <button onClick={handleReset} className="btn-primary text-sm">
              Subir otro script
            </button>
          </div>
        </div>
      </div>
    )
  }

  const steps = ['Destino', 'Identificación', 'Contenido SQL', 'Confirmar']

  return (
    <div className="page-shell max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: 'linear-gradient(180deg,#0de6b4,#cc27b0)' }} />
            <h1 className="page-title mb-0">Nuevo Script DDL</h1>
          </div>
        </div>
      </div>

      <StepIndicator current={step} steps={steps} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form column */}
        <div className="lg:col-span-3">
          <form onSubmit={handleSubmit} noValidate>

            {/* ── STEP 1: Destino ── */}
            {step === 1 && (
              <div className="space-y-5">
                <h2 className="section-title">¿Dónde va el script?</h2>

                {/* Folder type */}
                <div>
                  <label className="label">Tipo de carpeta</label>
                  <div className="grid grid-cols-1 gap-2">
                    {envFolders.map((f) => (
                      <label
                        key={f.value}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          form.folderType === f.value
                            ? 'border-gitlab-orange bg-gitlab-orange/10'
                            : 'border-gitlab-border hover:border-gitlab-muted'
                        }`}
                      >
                        <input
                          type="radio"
                          name="folderType"
                          value={f.value}
                          checked={form.folderType === f.value}
                          onChange={() => set('folderType', f.value)}
                          className="mt-0.5 accent-orange-500"
                        />
                        <div>
                          <div className="text-sm text-white font-medium">{f.label}</div>
                          {f.value === 'shared' && (
                            <div className="text-xs text-gitlab-muted mt-0.5">
                              El script corre en todos los ambientes. Se guarda en{' '}
                              <span className="code">{appConfig.ddlRoot}/{appConfig.sharedFolder}/</span>.
                            </div>
                          )}
                          {f.value === 'env' && (
                            <div className="text-xs text-gitlab-muted mt-0.5">
                              El script corre solo en el ambiente seleccionado.
                            </div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Environment (only when folderType = env) */}
                {form.folderType === 'env' && (
                  <div>
                    <label className="label">Ambiente</label>
                    <div className="grid grid-cols-3 gap-2">
                      {ENVIRONMENTS.map((env) => {
                        const hasAccess = !!projectMap?.[env]?.[form.entity]
                        return (
                          <label
                            key={env}
                            className={`flex items-center justify-center p-2.5 rounded-lg border cursor-pointer transition-colors text-sm font-medium ${
                              form.environment === env
                                ? 'border-gitlab-orange bg-gitlab-orange/10 text-white'
                                : hasAccess
                                ? 'border-gitlab-border hover:border-gitlab-muted text-gitlab-text'
                                : 'border-gitlab-border text-gitlab-muted opacity-50 cursor-not-allowed'
                            }`}
                          >
                            <input
                              type="radio"
                              name="environment"
                              value={env}
                              checked={form.environment === env}
                              onChange={() => set('environment', env)}
                              disabled={!hasAccess}
                              className="sr-only"
                            />
                            {env}
                          </label>
                        )
                      })}
                    </div>
                    {errors.environment && (
                      <p className="text-red-400 text-xs mt-1">{errors.environment}</p>
                    )}
                  </div>
                )}

                {/* Entity */}
                <div>
                  <label className="label">Entidad</label>
                  <div className="grid grid-cols-4 gap-2">
                    {ENTITIES.map((e) => (
                      <label
                        key={e}
                        className={`flex items-center justify-center p-2.5 rounded-lg border cursor-pointer transition-colors text-sm font-medium ${
                          form.entity === e
                            ? 'border-gitlab-orange bg-gitlab-orange/10 text-white'
                            : 'border-gitlab-border hover:border-gitlab-muted text-gitlab-text'
                        }`}
                      >
                        <input
                          type="radio"
                          name="entity"
                          value={e}
                          checked={form.entity === e}
                          onChange={() => set('entity', e)}
                          className="sr-only"
                        />
                        {e}
                      </label>
                    ))}
                  </div>
                  {errors.entity && (
                    <p className="text-red-400 text-xs mt-1">{errors.entity}</p>
                  )}
                </div>

                {/* Schema type */}
                <div>
                  <label className="label">Schema</label>
                  <div className="grid grid-cols-2 gap-2">
                    {SCHEMA_TYPES.map((t) => (
                      <label
                        key={t}
                        className={`flex items-center justify-center p-2.5 rounded-lg border cursor-pointer transition-colors text-sm font-medium ${
                          form.schemaType === t
                            ? 'border-gitlab-orange bg-gitlab-orange/10 text-white'
                            : 'border-gitlab-border hover:border-gitlab-muted text-gitlab-text'
                        }`}
                      >
                        <input
                          type="radio"
                          name="schemaType"
                          value={t}
                          checked={form.schemaType === t}
                          onChange={() => set('schemaType', t)}
                          className="sr-only"
                        />
                        {t}{form.entity}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Access warning */}
                {form.folderType === 'env' && !project && (
                  <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs">
                    ⚠️ Sin acceso al proyecto {form.environment}/ENTIDAD{form.entity}. Verificá los permisos del token.
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 2: Identificación ── */}
            {step === 2 && (
              <div className="space-y-5">
                <h2 className="section-title">Identificación del script</h2>

                {/* Ticket */}
                <div>
                  <label htmlFor="ticket" className="label">
                    Ticket JIRA
                    <span className="text-gitlab-muted font-normal ml-1">(ej: {ticketExample()})</span>
                  </label>
                  <input
                    id="ticket"
                    type="text"
                    className={`input font-mono ${errors.ticket ? 'border-red-500' : ''}`}
                    placeholder={ticketExample()}
                    value={form.ticket}
                    onChange={(e) => set('ticket', e.target.value.toUpperCase())}
                    autoFocus
                  />
                  {errors.ticket && (
                    <p className="text-red-400 text-xs mt-1">{errors.ticket}</p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="description" className="label">
                    Descripción corta
                    <span className="text-gitlab-muted font-normal ml-1">(se usa en el nombre del archivo)</span>
                  </label>
                  <input
                    id="description"
                    type="text"
                    className={`input ${errors.description ? 'border-red-500' : ''}`}
                    placeholder="crear tabla cliente"
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    maxLength={80}
                  />
                  {errors.description && (
                    <p className="text-red-400 text-xs mt-1">{errors.description}</p>
                  )}
                  {fileName && (
                    <p className="text-xs text-gitlab-muted mt-1">
                      Nombre generado: <span className="code text-gitlab-text">{fileName}</span>
                    </p>
                  )}
                </div>

                {/* Branch */}
                <div>
                  <label htmlFor="branch" className="label">
                    Rama
                  </label>
                  <input
                    id="branch"
                    type="text"
                    className="input font-mono"
                    value={form.branch}
                    onChange={(e) => set('branch', e.target.value)}
                  />
                  <p className="text-xs text-gitlab-muted mt-1">
                    Rama predeterminada: <span className="code">{appConfig.defaultBranch}</span>.
                    Cambiá sólo si trabajás en otra rama.
                  </p>
                </div>

                {/* Exists warning */}
                {filePath && (
                  <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                    checkingExists
                      ? 'bg-gitlab-card border-gitlab-border text-gitlab-muted'
                      : alreadyExists
                      ? 'bg-red-500/10 border-red-500/30 text-red-400'
                      : fileName
                      ? 'bg-green-500/10 border-green-500/30 text-green-400'
                      : 'bg-gitlab-card border-gitlab-border text-gitlab-muted'
                  }`}>
                    {checkingExists ? (
                      <><Spinner size="sm" /> Verificando si el archivo ya existe...</>
                    ) : alreadyExists ? (
                      <>⚠️ Ya existe <span className="font-mono">{fileName}</span> en el repo. Cambiá el ticket o la descripción.</>
                    ) : fileName ? (
                      <>✓ Ruta disponible: <span className="font-mono break-all">{filePath}</span></>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 3: Contenido SQL ── */}
            {step === 3 && (
              <div className="space-y-5">
                <h2 className="section-title">Contenido SQL</h2>
                <p className="text-xs text-gitlab-muted">
                  Los headers <span className="code">JIRA_TICKET</span> y{' '}
                  <span className="code">TARGET_SCHEMA</span> se agregan automáticamente.
                  Escribí solo el DDL.
                </p>

                {/* Headers preview (read-only) */}
                <div className="p-3 rounded-md bg-gitlab-darker border border-gitlab-border font-mono text-xs text-gitlab-muted select-none">
                  <div className="text-green-400">-- JIRA_TICKET: {form.ticket.toUpperCase() || ticketExample('????')}</div>
                  <div className="text-green-400">-- TARGET_SCHEMA: {form.schemaType}{form.entity}</div>
                  <div className="mt-2 text-gitlab-muted">{'(tu DDL va aquí abajo)'}</div>
                </div>

                {/* SQL body */}
                <div>
                  <label htmlFor="body" className="label">DDL</label>
                  <textarea
                    id="body"
                    className={`input font-mono text-sm resize-none h-64 ${errors.body ? 'border-red-500' : ''}`}
                    placeholder={`CREATE TABLE ${form.schemaType}${form.entity}.MI_TABLA (\n  ID NUMBER NOT NULL,\n  ...\n  CONSTRAINT PK_MI_TABLA PRIMARY KEY (ID)\n);\n`}
                    value={form.body}
                    onChange={(e) => set('body', e.target.value)}
                    spellCheck={false}
                  />
                  {errors.body && (
                    <p className="text-red-400 text-xs mt-1">{errors.body}</p>
                  )}
                </div>
              </div>
            )}

            {/* ── STEP 4: Confirmar ── */}
            {step === 4 && (
              <div className="space-y-5">
                <h2 className="section-title">Confirmar y subir</h2>

                <dl className="space-y-2 text-sm">
                  {[
                    ['Repo destino', project?.path_with_namespace ?? '—'],
                    ['Archivo', fileName],
                    ['Ruta completa', filePath],
                    ['Rama', form.branch],
                    ['Schema', `${form.schemaType}${form.entity}`],
                    ['Ticket', form.ticket.toUpperCase()],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-2 py-1 border-b border-gitlab-border/50">
                      <dt className="text-gitlab-muted w-32 shrink-0">{k}</dt>
                      <dd className="text-white font-mono text-xs break-all">{v}</dd>
                    </div>
                  ))}
                </dl>

                {alreadyExists && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                    ⚠️ El archivo ya existe. Volvé al paso 2 y cambiá el ticket o la descripción.
                  </div>
                )}

                {result?.success === false && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                    Error: {result.error}
                  </div>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-4 border-t border-gitlab-border">
              <button
                type="button"
                onClick={goBack}
                disabled={step === 1 || submitting}
                className="btn-secondary"
              >
                ← Atrás
              </button>

              {step < 4 ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="btn-primary"
                  disabled={checkingExists}
                >
                  Siguiente →
                </button>
              ) : (
                <button
                  type="submit"
                  className="btn-primary flex items-center gap-2"
                  disabled={submitting || alreadyExists || !project}
                >
                  {submitting ? (
                    <><Spinner size="sm" /> Subiendo...</>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Subir script
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Preview column */}
        <div className="lg:col-span-2">
          <div className="sticky top-6">
            <h3 className="section-title text-sm mb-2">Vista previa</h3>
            <PreviewPanel filePath={filePath} content={fullContent} />

            {/* Destination info */}
            {project && (
              <div className="mt-3 p-3 rounded-lg bg-gitlab-card border border-gitlab-border text-xs space-y-1">
                <div className="text-gitlab-muted font-medium mb-1">Repositorio destino</div>
                <div className="text-gitlab-text truncate">
                  {project.path_with_namespace}
                </div>
                <a
                  href={project.web_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gitlab-orange hover:underline"
                >
                  Abrir en GitLab →
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
