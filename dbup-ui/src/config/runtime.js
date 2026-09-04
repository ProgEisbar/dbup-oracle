const DEFAULTS = Object.freeze({
  environments: ['DEV', 'QA', 'UAT'],
  entities: ['700', '701', '702', '703'],
  schemaTypes: ['ENTIDAD', 'PARAM'],
  defaultBranch: 'main',
  ddlRoot: 'dbup/ddl',
  rollbackRoot: 'dbup/rollback',
  templateRoot: 'templates/dev',
  sharedFolder: 'shared',
  projectPrefix: 'entidad',
  templateEnvironment: 'DEV',
  templateEntity: '700',
  ticketPrefix: 'DBUP',
  distributeJobName: 'distribute:dev',
  rollbackJobPrefix: 'rollback',
})

// These arrays keep a stable identity because several screens import them.
// They are populated from the safe backend configuration before protected
// routes are rendered.
export const ENVIRONMENTS = [...DEFAULTS.environments]
export const ENTITIES = [...DEFAULTS.entities]
export const SCHEMA_TYPES = [...DEFAULTS.schemaTypes]

const runtimeConfig = {
  ...DEFAULTS,
  environments: ENVIRONMENTS,
  entities: ENTITIES,
  schemaTypes: SCHEMA_TYPES,
}

function replaceItems(target, values, fallback) {
  const next = Array.isArray(values) && values.length > 0 ? values : fallback
  target.splice(0, target.length, ...next)
}

export function configureRuntimeConfig(input = {}) {
  replaceItems(ENVIRONMENTS, input.environments, DEFAULTS.environments)
  replaceItems(ENTITIES, input.entities, DEFAULTS.entities)
  replaceItems(SCHEMA_TYPES, input.schemaTypes, DEFAULTS.schemaTypes)

  for (const key of [
    'defaultBranch',
    'ddlRoot',
    'rollbackRoot',
    'templateRoot',
    'sharedFolder',
    'projectPrefix',
    'templateEnvironment',
    'templateEntity',
    'ticketPrefix',
    'distributeJobName',
    'rollbackJobPrefix',
  ]) {
    runtimeConfig[key] = typeof input[key] === 'string' && input[key]
      ? input[key]
      : DEFAULTS[key]
  }

  return runtimeConfig
}

export function getRuntimeConfig() {
  return runtimeConfig
}

export function ticketPattern(flags = 'i') {
  const escaped = runtimeConfig.ticketPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped}-\\d+$`, flags)
}

export function ticketSearchPattern(flags = 'i') {
  const escaped = runtimeConfig.ticketPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}-\\d+`, flags)
}

export function ticketExample(number = '1234') {
  return `${runtimeConfig.ticketPrefix}-${number}`
}

export function stripRepositoryRoot(path, root) {
  const prefix = `${root}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}
