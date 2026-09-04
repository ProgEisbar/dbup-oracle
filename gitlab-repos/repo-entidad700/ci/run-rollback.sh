#!/usr/bin/env bash
set -euo pipefail

environment="${1:?Usage: ci/run-rollback.sh <DEV|QA|UAT>}"
ddl_dir="${DBUP_DDL_DIR:-dbup/ddl}"
rollback_dir="${DBUP_ROLLBACK_DIR:-dbup/rollback}"
log_dir="${DBUP_LOG_DIR:-dbup/logs}"
sql_cmd="${DBUP_SQL_CMD:-sql}"
rollback_script="${DBUP_ROLLBACK_SCRIPT:-}"

case "$environment" in
  DEV|QA|UAT) ;;
  *)
    echo "Invalid environment: $environment"
    echo "Allowed environments: DEV, QA, UAT"
    exit 1
    ;;
esac

if [[ -z "$rollback_script" ]]; then
  echo "Missing GitLab CI variable: DBUP_ROLLBACK_SCRIPT"
  echo "Expected example: shared/ENTIDAD700/DBUP-1234_descripcion_rollback.sql"
  exit 1
fi

rollback_pattern='^(shared|dev|qa|uat)/(ENTIDAD|PARAM)[0-9]{3}/DBUP-[0-9]+_[A-Za-z0-9_]+_rollback\.sql$'
if [[ ! "$rollback_script" =~ $rollback_pattern ]]; then
  echo "Invalid rollback script path: $rollback_script"
  echo "Expected: <shared|dev|qa|uat>/<ENTIDAD###|PARAM###>/DBUP-1234_description_rollback.sql"
  exit 1
fi

rollback_file="$rollback_dir/$rollback_script"
if [[ ! -f "$rollback_file" ]]; then
  echo "Rollback script not found: $rollback_file"
  exit 1
fi

deploy_script="${rollback_script%_rollback.sql}.sql"
deploy_file="$ddl_dir/$deploy_script"
if [[ ! -f "$deploy_file" ]]; then
  echo "Matching deploy script not found: $deploy_file"
  exit 1
fi

ticket="$(sed -nE 's/^[[:space:]]*--[[:space:]]*JIRA_TICKET:[[:space:]]*(DBUP-[0-9]+)[[:space:]]*$/\1/p' "$rollback_file" | head -n 1)"
schema="$(sed -nE 's/^[[:space:]]*--[[:space:]]*TARGET_SCHEMA:[[:space:]]*((ENTIDAD|PARAM)[0-9]{3})[[:space:]]*$/\1/p' "$rollback_file" | head -n 1)"
rollback_of="$(sed -nE 's/^[[:space:]]*--[[:space:]]*ROLLBACK_OF:[[:space:]]*(.*[^[:space:]])[[:space:]]*$/\1/p' "$rollback_file" | head -n 1)"

if [[ -z "$ticket" || -z "$schema" ]]; then
  echo "Rollback script must include JIRA_TICKET and TARGET_SCHEMA headers."
  exit 1
fi

if [[ "$rollback_of" != "$deploy_script" ]]; then
  echo "Invalid ROLLBACK_OF header in $rollback_file"
  echo "Expected: -- ROLLBACK_OF: $deploy_script"
  exit 1
fi

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

if ! command -v "$sql_cmd" >/dev/null 2>&1; then
  echo "$sql_cmd is required in DBUP_SQLCL_IMAGE."
  exit 1
fi

connect_string="${db_user}/${db_password}@//${host}:${db_port}/${db_service_name}"
client_identifier="rollback-pipeline:${CI_PIPELINE_ID:-local};job:${CI_JOB_ID:-local}"
log_name="$(printf "%s" "$rollback_script" | sed -E 's#[/\\]+#_#g; s#\\.sql$##')"
log_file="$log_dir/${environment}_ROLLBACK_${log_name}.log"

mkdir -p "$log_dir"
echo "Running rollback $rollback_script on $environment for $schema ($ticket)"

set +e
can_rollback="$(
  "$sql_cmd" -s "$connect_string" <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET HEADING OFF FEEDBACK OFF VERIFY OFF ECHO OFF PAGESIZE 0
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('DBUP_ROLLBACK', '$environment');
  DBMS_SESSION.SET_IDENTIFIER(SUBSTR('$client_identifier', 1, 128));
END;
/
SELECT COUNT(*)
FROM DBUP_CHANGELOG
WHERE SCRIPT_NAME = '$deploy_script'
  AND ENVIRONMENT = '$environment'
  AND STATUS = 'SUCCESS'
  AND NVL(ROLLBACK_STATUS, 'AVAILABLE') <> 'SUCCESS';
EXIT
SQL
)"
read_status=$?
set -e
can_rollback="$(printf "%s" "$can_rollback" | tr -d "[:space:]")"

if [[ "$read_status" -ne 0 || ! "$can_rollback" =~ ^[0-9]+$ ]]; then
  echo "Could not validate DBUP_CHANGELOG rollback status for $deploy_script."
  echo "SQLcl exit code: $read_status"
  echo "SQLcl output: $can_rollback"
  exit 1
fi

if [[ "$can_rollback" == "0" ]]; then
  echo "Rollback skipped. Deploy script is not registered as SUCCESS or rollback already succeeded: $deploy_script"
  exit 0
fi

set +e
"$sql_cmd" -s "$connect_string" >"$log_file" <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('DBUP_ROLLBACK', '$environment');
  DBMS_SESSION.SET_IDENTIFIER(SUBSTR('$client_identifier', 1, 128));
END;
/
@"$rollback_file" "$environment" "$ticket" "$schema" "${CI_COMMIT_SHA:-local}"
EXIT
SQL
run_status=$?
set -e

if [[ "$run_status" -ne 0 ]] || grep -Eiq "(ORA-|SP2-|PLS-)" "$log_file"; then
  "$sql_cmd" -s "$connect_string" <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('DBUP_ROLLBACK', '$environment');
  DBMS_SESSION.SET_IDENTIFIER(SUBSTR('$client_identifier', 1, 128));
END;
/
UPDATE DBUP_CHANGELOG
   SET ROLLBACK_SCRIPT_NAME = '$rollback_script',
       ROLLBACK_STATUS = 'FAILED',
       ROLLBACK_AT = SYSTIMESTAMP,
       ROLLBACK_BY = SYS_CONTEXT('USERENV', 'SESSION_USER'),
       ROLLBACK_ERROR = SUBSTR('See GitLab artifact log: $log_file', 1, 4000)
 WHERE SCRIPT_NAME = '$deploy_script'
   AND ENVIRONMENT = '$environment'
   AND STATUS = 'SUCCESS';
COMMIT;
EXIT
SQL
  echo "Oracle error found while running rollback $rollback_script. See $log_file"
  echo "SQLcl exit code: $run_status"
  echo "Execution log:"
  cat "$log_file"
  exit 1
fi

"$sql_cmd" -s "$connect_string" <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('DBUP_ROLLBACK', '$environment');
  DBMS_SESSION.SET_IDENTIFIER(SUBSTR('$client_identifier', 1, 128));
END;
/
UPDATE DBUP_CHANGELOG
   SET ROLLBACK_SCRIPT_NAME = '$rollback_script',
       ROLLBACK_STATUS = 'SUCCESS',
       ROLLBACK_AT = SYSTIMESTAMP,
       ROLLBACK_BY = SYS_CONTEXT('USERENV', 'SESSION_USER'),
       ROLLBACK_ERROR = NULL
 WHERE SCRIPT_NAME = '$deploy_script'
   AND ENVIRONMENT = '$environment'
   AND STATUS = 'SUCCESS';
COMMIT;
EXIT
SQL

echo "Rollback completed successfully: $rollback_script"
