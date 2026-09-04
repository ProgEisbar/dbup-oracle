import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import Spinner from '../components/Spinner.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import {
  ENTITIES,
  ENVIRONMENTS,
  SCHEMA_TYPES,
  buildRollbackPath,
  cancelPipeline,
  createFile,
  fileExists,
  generateRollbackContent,
  getPipelineJobs,
  getPipelines,
  listDdlScripts,
  listRollbackScripts,
  playJob,
  getRuntimeConfig,
  stripRepositoryRoot,
  ticketSearchPattern,
} from '../services/api.js'

function ticketFromFile(name = '') {
  return name.match(ticketSearchPattern())?.[0]?.toUpperCase() ?? ''
}

function scriptLabel(script) {
  return script ? `${script.envFolder}/${script.schema}/${script.name}` : ''
}

function matchesEnvironment(script, env) {
  const folder = script?.envFolder?.toLowerCase()
  return folder === getRuntimeConfig().sharedFolder.toLowerCase() || folder === env.toLowerCase()
}

function StepTitle({ number, title, secondary = false }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className={`flex h-7 w-7 items-center justify-center rounded border text-xs font-bold ${
        secondary
          ? 'border-dbup-magenta/40 bg-dbup-magenta/10 text-pink-300'
          : 'border-dbup-teal/40 bg-dbup-teal/10 text-dbup-teal'
      }`}>
        {number}
      </span>
      <h2 className="section-title mb-0">{title}</h2>
    </div>
  )
}

export default function Rollback() {
  const { connectionStatus, projectMap, notify } = useApp()
  const isConnected = connectionStatus === 'connected'
  const appConfig = getRuntimeConfig()

  const [env, setEnv] = useState(ENVIRONMENTS[0])
  const [entity, setEntity] = useState(ENTITIES[0])
  const [schemaType, setSchemaType] = useState(SCHEMA_TYPES[0])
  const [branch, setBranch] = useState(appConfig.defaultBranch)
  const [ddlScripts, setDdlScripts] = useState([])
  const [rollbackScripts, setRollbackScripts] = useState([])
  const [selectedDdlPath, setSelectedDdlPath] = useState('')
  const [selectedRollback, setSelectedRollback] = useState('')
  const [body, setBody] = useState('')
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [checkingExists, setCheckingExists] = useState(false)
  const [alreadyExists, setAlreadyExists] = useState(false)
  const [saving, setSaving] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [lastPipeline, setLastPipeline] = useState(null)

  const project = projectMap?.[env]?.[entity] ?? null
  const targetSchema = `${schemaType}${entity}`

  const filteredDdlScripts = useMemo(() => ddlScripts
    .filter((script) => script.schema === targetSchema && matchesEnvironment(script, env))
    .sort((a, b) => scriptLabel(a).localeCompare(scriptLabel(b))),
  [ddlScripts, targetSchema, env])

  const filteredRollbackScripts = useMemo(() => rollbackScripts
    .filter((script) => script.schema === targetSchema && matchesEnvironment(script, env))
    .sort((a, b) => scriptLabel(a).localeCompare(scriptLabel(b))),
  [rollbackScripts, targetSchema, env])

  const selectedDdl = filteredDdlScripts.find((script) => script.path === selectedDdlPath) ?? null
  const rollbackPath = selectedDdl ? buildRollbackPath(selectedDdl.path) : ''
  const rollbackScript = stripRepositoryRoot(rollbackPath, appConfig.rollbackRoot)
  const rollbackOf = selectedDdl?.path
    ? stripRepositoryRoot(selectedDdl.path, appConfig.ddlRoot)
    : ''
  const ticket = ticketFromFile(selectedDdl?.name)
  const fullContent = selectedDdl ? generateRollbackContent(ticket, targetSchema, rollbackOf, body) : ''

  const loadFiles = useCallback(async () => {
    if (!project) {
      setDdlScripts([])
      setRollbackScripts([])
      return
    }

    setLoadingFiles(true)
    try {
      const [ddl, rollback] = await Promise.all([
        listDdlScripts(project.id, branch),
        listRollbackScripts(project.id, branch),
      ])
      setDdlScripts(ddl)
      setRollbackScripts(rollback)
    } catch (err) {
      notify('error', `Error al cargar archivos: ${err.message}`)
    } finally {
      setLoadingFiles(false)
    }
  }, [project, branch, notify])

  useEffect(() => { loadFiles() }, [loadFiles])

  useEffect(() => {
    if (filteredDdlScripts.length === 0) {
      setSelectedDdlPath('')
    } else if (!filteredDdlScripts.some((script) => script.path === selectedDdlPath)) {
      setSelectedDdlPath(filteredDdlScripts[0].path)
    }
  }, [filteredDdlScripts, selectedDdlPath])

  useEffect(() => {
    if (filteredRollbackScripts.length === 0) {
      setSelectedRollback('')
    } else if (!filteredRollbackScripts.some((script) => script.rollbackScript === selectedRollback)) {
      setSelectedRollback(filteredRollbackScripts[0].rollbackScript)
    }
  }, [filteredRollbackScripts, selectedRollback])

  useEffect(() => {
    if (!project || !rollbackPath) {
      setAlreadyExists(false)
      return
    }

    let cancelled = false
    setCheckingExists(true)
    fileExists(project.id, rollbackPath, branch)
      .then((exists) => { if (!cancelled) setAlreadyExists(exists) })
      .catch(() => { if (!cancelled) setAlreadyExists(false) })
      .finally(() => { if (!cancelled) setCheckingExists(false) })
    return () => { cancelled = true }
  }, [project, rollbackPath, branch])

  async function handleCreateRollback(event) {
    event.preventDefault()
    if (!project || !selectedDdl) return notify('error', 'Seleccioná un DDL origen.')
    if (!body.trim()) return notify('error', 'El SQL de rollback no puede estar vacío.')
    if (alreadyExists) return notify('error', 'El rollback ya existe. Ejecutalo desde la lista de archivos existentes.')

    setSaving(true)
    try {
      await createFile(project.id, {
        filePath: rollbackPath,
        content: fullContent,
        commitMessage: `[DBUP] Agregar rollback ${selectedDdl.name}`,
        branch,
      })
      notify('success', `Rollback creado: ${rollbackScript}`)
      setSelectedRollback(rollbackScript)
      setBody('')
      await loadFiles()
    } catch (err) {
      notify('error', `Error al crear rollback: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function findRollbackJob() {
    const pipelines = await getPipelines(project.id, 8)
    for (const pipeline of pipelines) {
      const jobs = await getPipelineJobs(project.id, pipeline.id)
      const job = jobs.find((item) => item.name === `${appConfig.rollbackJobPrefix}:${env.toLowerCase()}`)
      if (job && ['manual', 'created'].includes(job.status)) return { pipeline, job }
    }
    return null
  }

  async function handleRunRollback(scriptToRun = selectedRollback) {
    if (!project || !scriptToRun) return notify('error', 'Seleccioná un rollback para ejecutar.')

    setPlaying(true)
    setLastPipeline(null)
    try {
      const found = await findRollbackJob()
      if (!found) return notify('error', 'No encontré un job manual de rollback en los pipelines recientes.')

      await playJob(project.id, found.job.id, [
        { key: 'DBUP_ROLLBACK_SCRIPT', value: scriptToRun },
      ])
      setLastPipeline(found.pipeline)
      notify('success', `Rollback enviado: ${scriptToRun}`)
    } catch (err) {
      notify('error', `Error al ejecutar rollback: ${err.message}`)
    } finally {
      setPlaying(false)
    }
  }

  async function handleCancelPipeline() {
    if (!project || !lastPipeline) return
    try {
      await cancelPipeline(project.id, lastPipeline.id)
      notify('success', `Pipeline #${lastPipeline.id} cancelado`)
      setLastPipeline(null)
    } catch (err) {
      notify('error', `Error al cancelar pipeline: ${err.message}`)
    }
  }

  if (!isConnected) {
    return <div className="p-8 text-center text-dbup-muted">Iniciá sesión para administrar rollbacks.</div>
  }

  return (
    <div className="page-shell">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <span className="h-7 w-1 rounded-full bg-dbup-teal" />
            <h1 className="page-title mb-0">Rollback</h1>
          </div>
          <p className="ml-4 text-sm text-dbup-muted">Prepará y ejecutá la reversión asociada a un DDL registrado.</p>
        </div>
        <button onClick={loadFiles} disabled={loadingFiles} className="btn-secondary flex h-10 items-center gap-2 text-sm">
          {loadingFiles ? <Spinner size="sm" /> : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M4 4v5h5M20 20v-5h-5M5.5 15a7 7 0 0011.8 2M18.5 9A7 7 0 006.7 7" />
            </svg>
          )}
          Actualizar
        </button>
      </header>

      <form onSubmit={handleCreateRollback} className="space-y-5">
        <section className="card p-5">
          <StepTitle number="1" title="Seleccionar destino" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[1.1fr_1.3fr_1fr_1fr]">
            <div>
              <label className="label text-xs">Ambiente</label>
              <div className="flex h-10 gap-1 rounded-md border border-dbup-border bg-dbup-navydark p-1">
                {ENVIRONMENTS.map((item) => (
                  <button key={item} type="button" onClick={() => setEnv(item)}
                    className={`min-w-0 flex-1 rounded px-2 text-sm font-bold transition-colors ${env === item
                      ? 'bg-dbup-teal text-dbup-navydark'
                      : 'text-dbup-muted hover:bg-white/5 hover:text-white'}`}>
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label text-xs">Entidad</label>
              <div className="flex h-10 gap-1 rounded-md border border-dbup-border bg-dbup-navydark p-1">
                {ENTITIES.map((item) => (
                  <button key={item} type="button" onClick={() => setEntity(item)}
                    className={`min-w-0 flex-1 rounded px-2 text-sm font-bold transition-colors ${entity === item
                      ? 'bg-dbup-teal text-dbup-navydark'
                      : 'text-dbup-muted hover:bg-white/5 hover:text-white'}`}>
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label text-xs">Schema</label>
              <select className="select h-10 text-sm" value={schemaType} onChange={(event) => setSchemaType(event.target.value)}>
                {SCHEMA_TYPES.map((item) => <option key={item} value={item}>{item}{entity}</option>)}
              </select>
            </div>

            <div>
              <label className="label text-xs">Rama</label>
              <input className="input h-10 font-mono text-sm" value={branch} onChange={(event) => setBranch(event.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-dbup-border pt-4 text-xs text-dbup-muted">
            <span>Repositorio: <strong className="font-mono font-medium text-dbup-text">{project?.path_with_namespace || 'Sin acceso'}</strong></span>
            <span>Destino: <strong className="font-mono font-medium text-dbup-text">{targetSchema}</strong></span>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="card p-5">
            <StepTitle number="2" title="Crear archivo de rollback" />
            {!project ? (
              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-200">
                No tenés acceso al repositorio {env}/ENTIDAD{entity}.
              </div>
            ) : loadingFiles ? (
              <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-dbup-muted"><Spinner /> Cargando scripts...</div>
            ) : (
              <div className="space-y-5">
                <div>
                  <label className="label">DDL origen</label>
                  <select className="select font-mono text-sm" value={selectedDdlPath} onChange={(event) => setSelectedDdlPath(event.target.value)}>
                    {filteredDdlScripts.length === 0
                      ? <option value="">Sin DDL disponibles para {targetSchema}</option>
                      : filteredDdlScripts.map((script) => <option key={script.path} value={script.path}>{scriptLabel(script)}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-[minmax(0,1fr)_180px]">
                  <div className="min-w-0 rounded-md border border-dbup-border bg-dbup-navydark p-3">
                    <div className="mb-1 text-dbup-muted">Ruta del archivo</div>
                    <div className="break-all font-mono text-dbup-text">{rollbackPath || 'Seleccioná un DDL origen'}</div>
                  </div>
                  <div className={`flex items-center rounded-md border p-3 font-medium ${checkingExists
                    ? 'border-dbup-border bg-dbup-navydark text-dbup-muted'
                    : alreadyExists
                      ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300'
                      : 'border-green-500/40 bg-green-500/10 text-green-300'}`}>
                    {checkingExists ? 'Verificando...' : alreadyExists ? 'El archivo ya existe' : 'Ruta disponible'}
                  </div>
                </div>

                <div>
                  <label className="label">SQL de rollback</label>
                  <textarea
                    className="input h-72 resize-y font-mono text-sm leading-6"
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder={`DROP TRIGGER ${targetSchema}.TRG_EJEMPLO;\nDROP FUNCTION ${targetSchema}.FN_EJEMPLO;\nDROP TABLE ${targetSchema}.TABLA_EJEMPLO PURGE;`}
                    spellCheck={false}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3 border-t border-dbup-border pt-4">
                  <button type="submit" disabled={saving || alreadyExists || !selectedDdl || !body.trim()}
                    className="btn-primary flex items-center gap-2">
                    {saving ? <><Spinner size="sm" /> Guardando...</> : 'Guardar rollback'}
                  </button>
                  <button type="button" disabled={playing || !rollbackScript || (!alreadyExists && !selectedRollback)}
                    onClick={() => handleRunRollback(alreadyExists ? rollbackScript : selectedRollback)}
                    className="btn-secondary flex items-center gap-2">
                    {playing ? <><Spinner size="sm" /> Ejecutando...</> : 'Ejecutar existente'}
                  </button>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <section className="card p-5">
              <StepTitle number="3" title="Ejecutar rollback" secondary />
              {filteredRollbackScripts.length === 0 ? (
                <div className="rounded-md border border-dashed border-dbup-border p-5 text-center">
                  <p className="text-sm text-dbup-muted">No hay archivos para {targetSchema}.</p>
                  <p className="mt-1 text-xs text-dbup-muted">Creá el primero desde el panel de la izquierda.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <select className="select font-mono text-xs" value={selectedRollback}
                    onChange={(event) => setSelectedRollback(event.target.value)}>
                    {filteredRollbackScripts.map((script) => (
                      <option key={script.path} value={script.rollbackScript}>{script.rollbackScript}</option>
                    ))}
                  </select>
                  <button type="button" disabled={playing || !selectedRollback}
                    onClick={() => handleRunRollback(selectedRollback)}
                    className="btn-primary flex w-full items-center justify-center gap-2 text-sm">
                    {playing ? <><Spinner size="sm" /> Ejecutando...</> : 'Ejecutar seleccionado'}
                  </button>
                </div>
              )}
            </section>

            <section className="card p-5">
              <h2 className="section-title">Vista previa</h2>
              <div className="mb-3 break-all font-mono text-xs text-dbup-muted">{rollbackPath || 'Sin archivo seleccionado'}</div>
              <pre className="max-h-96 min-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-dbup-border bg-dbup-navydark p-3 font-mono text-xs leading-5 text-dbup-text">
                {fullContent || 'Seleccioná un DDL origen para ver el archivo rollback.'}
              </pre>
            </section>

            {lastPipeline && (
              <section className="card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="section-title mb-1">Pipeline enviado</h2>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={lastPipeline.status} />
                      <span className="font-mono text-sm text-dbup-text">#{lastPipeline.id}</span>
                    </div>
                  </div>
                  <button onClick={handleCancelPipeline} className="btn-danger text-xs">Cancelar</button>
                </div>
                <a href={`${project.web_url}/-/pipelines/${lastPipeline.id}`} target="_blank" rel="noreferrer"
                  className="mt-3 inline-block text-xs text-dbup-teal hover:underline">
                  Ver en GitLab
                </a>
              </section>
            )}
          </aside>
        </div>
      </form>
    </div>
  )
}
