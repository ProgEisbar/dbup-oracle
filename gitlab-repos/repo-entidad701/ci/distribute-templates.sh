#!/usr/bin/env bash
set -euo pipefail

template_dir="${DBUP_TEMPLATE_DIR:-templates/dev}"
entities="${DBUP_DISTRIBUTE_ENTITIES:-700 701 702 703}"
current_entity="${DBUP_ENTITY:-700}"
token="${DBUP_DEV_REPO_TOKEN:-}"
source_url="${CI_PROJECT_URL:-}"
commit_sha="${CI_COMMIT_SHORT_SHA:-local}"

if [[ -z "$token" ]]; then
  echo "Missing GitLab CI variable: DBUP_DEV_REPO_TOKEN"
  exit 1
fi

if [[ -z "$source_url" ]]; then
  echo "Missing CI_PROJECT_URL. This job must run in GitLab CI."
  exit 1
fi

if [[ ! -d "$template_dir" ]]; then
  echo "Template directory not found: $template_dir"
  exit 0
fi

mapfile -t templates < <(find "$template_dir" -type f -name "*.sql.tpl" | sort)

if [[ "${#templates[@]}" -eq 0 ]]; then
  echo "No templates found in $template_dir"
  exit 0
fi

work_dir="$(mktemp -d)"

entity_in_list() {
  local needle="$1"
  shift

  for candidate in "$@"; do
    if [[ "$candidate" == "$needle" ]]; then
      return 0
    fi
  done

  return 1
}

get_target_entities() {
  local template="$1"
  local line raw token
  local targets=()

  line="$(grep -Eim1 '^[[:space:]]*--[[:space:]]*TARGET_ENTITIES[[:space:]]*:' "$template" || true)"
  if [[ -z "$line" ]]; then
    echo "Template $template must declare -- TARGET_ENTITIES: 700,701 or -- TARGET_ENTITIES: all" >&2
    return 1
  fi

  raw="${line#*:}"
  raw="${raw//,/ }"

  for token in $raw; do
    token="${token^^}"
    if [[ "$token" == "ALL" ]]; then
      echo "$entities"
      return 0
    fi

    if ! entity_in_list "$token" $entities; then
      echo "Template $template references unsupported entity: $token. Allowed: $entities" >&2
      return 1
    fi

    targets+=("$token")
  done

  if [[ "${#targets[@]}" -eq 0 ]]; then
    echo "Template $template has an empty TARGET_ENTITIES declaration." >&2
    return 1
  fi

  echo "${targets[*]}"
}

for template in "${templates[@]}"; do
  get_target_entities "$template" > /dev/null
done

for entity in $entities; do
  source_base="${source_url%entidad${current_entity}}"
  if [[ "$source_base" == "$source_url" ]]; then
    echo "Could not derive target repo URL from CI_PROJECT_URL: $source_url"
    exit 1
  fi

  target_repo_url="${source_base}entidad${entity}.git"
  if [[ "$target_repo_url" != https://* ]]; then
    echo "Only HTTPS GitLab project URLs are supported: $target_repo_url"
    exit 1
  fi
  auth_url="https://oauth2:${token}@${target_repo_url#https://}"
  clone_dir="$work_dir/entidad${entity}"

  echo "Distributing templates to ENTIDAD${entity}"
  git clone "$auth_url" "$clone_dir"

  mkdir -p "$clone_dir/dbup/ddl/shared/ENTIDAD${entity}"

  for template in "${templates[@]}"; do
    file_name="$(basename "$template" .tpl)"
    target_file="$clone_dir/dbup/ddl/shared/ENTIDAD${entity}/$file_name"
    target_entities="$(get_target_entities "$template")"

    if ! entity_in_list "$entity" $target_entities; then
      rm -f "$target_file"
      continue
    fi

    content="$(<"$template")"
    content="${content//\{\{ENTITY\}\}/$entity}"
    content="${content//\{\{ENTIDAD\}\}/ENTIDAD${entity}}"
    content="${content//\{\{PARAM\}\}/PARAM${entity}}"
    content="${content//\{\{USER_SERVICES\}\}/USER_SERVICES${entity}}"

    printf "%s\n" "$content" > "$target_file"
  done

  (
    cd "$clone_dir"
    git config user.name "DBUP GitLab"
    git config user.email "dbup-bot@example.invalid"
    git add dbup/ddl/shared
    git commit -m "Distribuir templates DEV desde ENTIDAD${current_entity} ${commit_sha}" || echo "No changes to distribute for ENTIDAD${entity}"
    git push origin main
  )
done
