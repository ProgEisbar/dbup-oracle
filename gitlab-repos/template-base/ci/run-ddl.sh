#!/usr/bin/env bash
set -euo pipefail

environment="${1:?Usage: ci/run-ddl.sh <DEV|QA|UAT>}"
ddl_dir="${DBUP_DDL_DIR:-dbup/ddl}"
rollback_dir="${DBUP_ROLLBACK_DIR:-dbup/rollback}"
log_dir="${DBUP_LOG_DIR:-dbup/logs}"
sql_cmd="${DBUP_SQL_CMD:-sql}"
env_lower="$(printf "%s" "$environment" | tr "[:upper:]" "[:lower:]")"

case "$environment" in
  DEV|QA|UAT) ;;
  *)
    echo "Invalid environment: $environment"
    echo "Allowed environments: DEV, QA, UAT"
    exit 1
    ;;
esac

host_var="DBUP_${environment}_HOST"
host="${!host_var:-}"
db_user="${DB_USER:-}"
db_password="${DB_PASSWORD:-}"
db_port="${DB_PORT:-}"
db_service_name="${DB_SERVICES_NAME:-}"

missing=0
for var_name in DB_USER DB_PASSWORD DB_SERVICES_NAME DB_PORT "$host_var"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing GitLab CI variable: $var_name"
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

connect_string="${db_user}/${db_password}@//${host}:${db_port}/${db_service_name}"
client_identifier="pipeline:${CI_PIPELINE_ID:-local};job:${CI_JOB_ID:-local}"

if ! command -v "$sql_cmd" >/dev/null 2>&1; then
  echo "$sql_cmd is required in DBUP_SQLCL_IMAGE."
  exit 1
fi

mkdir -p "$log_dir"

search_dirs=()
[[ -d "$ddl_dir/shared" ]] && search_dirs+=("$ddl_dir/shared")
[[ -d "$ddl_dir/$env_lower" ]] && search_dirs+=("$ddl_dir/$env_lower")

if [[ "${#search_dirs[@]}" -gt 0 ]]; then
  mapfile -t scripts < <(find "${search_dirs[@]}" -type f -name "*.sql" | sort)
else
  scripts=()
fi

if [[ "${#scripts[@]}" -eq 0 ]]; then
  echo "No scripts found for $environment."
  echo "Debug info:"
  echo "  Working directory: $(pwd)"
  echo "  DBUP_DDL_DIR: $ddl_dir"
  echo "  Environment folder: $env_lower"
  echo "  Files visible under dbup:"
  find dbup -maxdepth 8 -type f | sort || true
  exit 0
fi

for script in "${scripts[@]}"; do
  ticket="$(sed -nE 's/^[[:space:]]*--[[:space:]]*JIRA_TICKET:[[:space:]]*(DBUP-[0-9]+)[[:space:]]*$/\1/p' "$script" | head -n 1)"
  schema="$(sed -nE 's/^[[:space:]]*--[[:space:]]*TARGET_SCHEMA:[[:space:]]*((ENTIDAD|PARAM)[0-9]{3})[[:space:]]*$/\1/p' "$script" | head -n 1)"
  script_name="${script#"$ddl_dir"/}"
  rollback_file="$rollback_dir/${script_name%.sql}_rollback.sql"
  rollback_script_name=""
  rollback_status_sql="NULL"
  rollback_script_sql="NULL"
  if [[ -f "$rollback_file" ]]; then
    rollback_script_name="${rollback_file#"$rollback_dir"/}"
    rollback_status_sql="'AVAILABLE'"
    rollback_script_sql="'$rollback_script_name'"
  fi
  log_name="$(printf "%s" "$script_name" | sed -E 's#[/\\]+#_#g; s#\\.sql$##')"
  log_file="$log_dir/${environment}_${log_name}.log"

  echo "Running $script_name on $environment for $schema ($ticket)"

  set +e
  already_executed="$(
    "$sql_cmd" -s "$connect_string" <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET HEADING OFF FEEDBACK OFF VERIFY OFF ECHO OFF PAGESIZE 0
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('DBUP_GITLAB', '$environment');
  DBMS_SESSION.SET_IDENTIFIER(SUBSTR('$client_identifier', 1, 128));
END;
/
SELECT COUNT(*)
FROM DBUP_CHANGELOG
WHERE SCRIPT_NAME = '$script_name'
  AND ENVIRONMENT = '$environment'
  AND STATUS = 'SUCCESS';
EXIT
SQL
  )"
  read_status=$?
  set -e
  already_executed="$(printf "%s" "$already_executed" | tr -d "[:space:]")"

  if [[ "$read_status" -ne 0 ]]; then
    echo "Could not connect/read DBUP_CHANGELOG for $script_name."
    echo "SQLcl exit code: $read_status"
    echo "SQLcl output:"
    printf "%s\n" "$already_executed"
    exit 1
  fi

  if [[ ! "$already_executed" =~ ^[0-9]+$ ]]; then
    echo "Could not read DBUP_CHANGELOG execution status for $script_name."
    echo "SQLcl output: $already_executed"
    exit 1
  fi

  if [[ "$already_executed" != "0" ]]; then
    echo "Skipping $script_name on $environment because it is already registered as SUCCESS."
    continue
  fi

  set +e
  "$sql_cmd" -s "$connect_string" >"$log_file" <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('DBUP_GITLAB', '$environment');
  DBMS_SESSION.SET_IDENTIFIER(SUBSTR('$client_identifier', 1, 128));
END;
/
@"$script" "$environment" "$ticket" "$schema" "${CI_COMMIT_SHA:-local}"
EXIT
SQL
  run_status=$?
  set -e

  if [[ "$run_status" -ne 0 ]] || grep -Eiq "(ORA-|SP2-|PLS-)" "$log_file"; then
    "$sql_cmd" -s "$connect_string" <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('DBUP_GITLAB', '$environment');
  DBMS_SESSION.SET_IDENTIFIER(SUBSTR('$client_identifier', 1, 128));
END;
/
INSERT INTO DBUP_CHANGELOG (
  JIRA_TICKET, SCRIPT_NAME, TARGET_SCHEMA, ENVIRONMENT, GIT_COMMIT_SHA, STATUS, ERROR_MESSAGE,
  ROLLBACK_SCRIPT_NAME, ROLLBACK_STATUS
) VALUES (
  '$ticket', '$script_name', '$schema', '$environment', '${CI_COMMIT_SHA:-local}', 'FAILED',
  SUBSTR('See GitLab artifact log: $log_file', 1, 4000),
  $rollback_script_sql, $rollback_status_sql
);
COMMIT;
EXIT
SQL
    echo "Oracle error found while running $script_name. See $log_file"
    echo "SQLcl exit code: $run_status"
    echo "Execution log:"
    cat "$log_file"
    exit 1
  fi

  "$sql_cmd" -s "$connect_string" <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('DBUP_GITLAB', '$environment');
  DBMS_SESSION.SET_IDENTIFIER(SUBSTR('$client_identifier', 1, 128));
END;
/
INSERT INTO DBUP_CHANGELOG (
  JIRA_TICKET, SCRIPT_NAME, TARGET_SCHEMA, ENVIRONMENT, GIT_COMMIT_SHA, STATUS,
  ROLLBACK_SCRIPT_NAME, ROLLBACK_STATUS
) VALUES (
  '$ticket', '$script_name', '$schema', '$environment', '${CI_COMMIT_SHA:-local}', 'SUCCESS',
  $rollback_script_sql, $rollback_status_sql
);
COMMIT;
EXIT
SQL
done
