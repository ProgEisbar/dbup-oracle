#!/usr/bin/env bash
set -euo pipefail

ddl_dir="${DBUP_DDL_DIR:-dbup/ddl}"
rollback_dir="${DBUP_ROLLBACK_DIR:-dbup/rollback}"
ddl_pattern="^${ddl_dir}/(shared|dev|qa|uat)/((ENTIDAD|PARAM)[0-9]{3})/DBUP-[0-9]+_[A-Za-z0-9_]+\\.sql$"
rollback_pattern="^${rollback_dir}/(shared|dev|qa|uat)/((ENTIDAD|PARAM)[0-9]{3})/DBUP-[0-9]+_[A-Za-z0-9_]+_rollback\\.sql$"

if [[ ! -d "$ddl_dir" && ! -d "$rollback_dir" ]]; then
  echo "DDL/rollback directories not found: $ddl_dir, $rollback_dir"
  exit 1
fi

if [[ -n "${CI_MERGE_REQUEST_DIFF_BASE_SHA:-}" ]]; then
  base_ref="$CI_MERGE_REQUEST_DIFF_BASE_SHA"
else
  base_ref="${CI_COMMIT_BEFORE_SHA:-}"
fi

if [[ -n "${base_ref:-}" && "$base_ref" != "0000000000000000000000000000000000000000" ]]; then
  mapfile -t files < <(git diff --name-only "$base_ref" "${CI_COMMIT_SHA:-HEAD}" -- "$ddl_dir" "$rollback_dir" | sort)
else
  mapfile -t files < <(find "$ddl_dir" "$rollback_dir" -type f -name "*.sql" 2>/dev/null | sort)
fi

if [[ "${#files[@]}" -eq 0 ]]; then
  echo "No DDL or rollback files to validate."
  exit 0
fi

failed=0
for file in "${files[@]}"; do
  [[ "$file" == *.sql ]] || continue

  if [[ "$file" == "$ddl_dir/"* ]]; then
    expected_pattern="$ddl_pattern"
    expected_text="$ddl_dir/<shared|dev|qa|uat>/<ENTIDAD###|PARAM###>/DBUP-1234_descripcion.sql"
    path_schema="$(printf "%s" "$file" | sed -nE "s#^${ddl_dir}/(shared|dev|qa|uat)/((ENTIDAD|PARAM)[0-9]{3})/.*#\\2#p")"
  elif [[ "$file" == "$rollback_dir/"* ]]; then
    expected_pattern="$rollback_pattern"
    expected_text="$rollback_dir/<shared|dev|qa|uat>/<ENTIDAD###|PARAM###>/DBUP-1234_descripcion_rollback.sql"
    path_schema="$(printf "%s" "$file" | sed -nE "s#^${rollback_dir}/(shared|dev|qa|uat)/((ENTIDAD|PARAM)[0-9]{3})/.*#\\2#p")"
  else
    continue
  fi

  if [[ ! "$file" =~ $expected_pattern ]]; then
    echo "Invalid DBUP file name: $file"
    echo "Expected: $expected_text"
    failed=1
  fi

  target_schema="$(sed -nE 's/^[[:space:]]*--[[:space:]]*TARGET_SCHEMA:[[:space:]]*((ENTIDAD|PARAM)[0-9]{3})[[:space:]]*$/\1/p' "$file" | head -n 1)"

  if [[ -z "$target_schema" ]]; then
    echo "Missing or invalid TARGET_SCHEMA header in $file"
    echo "Expected header example: -- TARGET_SCHEMA: ENTIDAD700"
    failed=1
  elif [[ -n "$path_schema" && "$target_schema" != "$path_schema" ]]; then
    echo "TARGET_SCHEMA does not match folder in $file"
    echo "Folder schema: $path_schema"
    echo "Header schema: $target_schema"
    failed=1
  fi

  if ! grep -Eq "^[[:space:]]*--[[:space:]]*JIRA_TICKET:[[:space:]]*DBUP-[0-9]+[[:space:]]*$" "$file"; then
    echo "Missing or invalid JIRA_TICKET header in $file"
    echo "Expected header example: -- JIRA_TICKET: DBUP-1234"
    failed=1
  fi

  if [[ "$file" == "$rollback_dir/"* ]]; then
    rollback_pair="${file#"$rollback_dir"/}"
    deploy_pair="${rollback_pair%_rollback.sql}.sql"
    deploy_file="$ddl_dir/$deploy_pair"

    if [[ ! -f "$deploy_file" ]]; then
      echo "Rollback file has no matching deployed DDL file: $file"
      echo "Expected matching file: $deploy_file"
      failed=1
    fi

    if ! grep -Eq "^[[:space:]]*--[[:space:]]*ROLLBACK_OF:[[:space:]]*${deploy_pair//\//\\/}[[:space:]]*$" "$file"; then
      echo "Missing or invalid ROLLBACK_OF header in $file"
      echo "Expected header example: -- ROLLBACK_OF: $deploy_pair"
      failed=1
    fi
  fi
done

exit "$failed"
