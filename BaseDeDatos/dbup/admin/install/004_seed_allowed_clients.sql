-- Whitelist parametrizada para clientes autorizados de DBUP.
-- No se incluyen IPs, usuarios ni hostnames internos.

ACCEPT DBUP_RUNNER_IP CHAR PROMPT 'IP del runner DBUP (ejemplo: {IP_RUNNER}): '
ACCEPT DBUP_RUNNER_OS_USER CHAR PROMPT 'Usuario de SO del runner (ejemplo: {USUARIO_RUNNER}): '
ACCEPT DBUP_RUNNER_HOST CHAR PROMPT 'Hostname del runner (ejemplo: {HOST_RUNNER} o *): '
ACCEPT DBUP_MANUAL_IP CHAR PROMPT 'IP del usuario manual (ejemplo: {IP_USUARIO} o *): '
ACCEPT DBUP_MANUAL_OS_USER CHAR PROMPT 'Usuario de SO manual (ejemplo: {USUARIO}): '
ACCEPT DBUP_MANUAL_HOST CHAR PROMPT 'Hostname manual (ejemplo: {HOST_USUARIO}): '

INSERT INTO &&DBUP_OWNER..DBUP_ALLOWED_CLIENTS (
  ENVIRONMENT, IP_ADDRESS, OS_USER, HOST_NAME,
  CLIENT_PROGRAM_NAME, DESCRIPTION, ENABLED
)
SELECT environment,
       '&&DBUP_RUNNER_IP',
       '&&DBUP_RUNNER_OS_USER',
       '&&DBUP_RUNNER_HOST',
       'SQLcl',
       'DBUP CI runner',
       'Y'
  FROM (
    SELECT 'DEV' environment FROM DUAL
    UNION ALL SELECT 'QA' FROM DUAL
    UNION ALL SELECT 'UAT' FROM DUAL
  );

INSERT INTO &&DBUP_OWNER..DBUP_ALLOWED_CLIENTS (
  ENVIRONMENT, IP_ADDRESS, OS_USER, HOST_NAME,
  CLIENT_PROGRAM_NAME, DESCRIPTION, ENABLED
)
SELECT environment,
       '&&DBUP_MANUAL_IP',
       '&&DBUP_MANUAL_OS_USER',
       '&&DBUP_MANUAL_HOST',
       client_program_name,
       'Authorized DBA workstation',
       'Y'
  FROM (
    SELECT 'DEV' environment FROM DUAL
    UNION ALL SELECT 'QA' FROM DUAL
    UNION ALL SELECT 'UAT' FROM DUAL
  ) environments
 CROSS JOIN (
    SELECT 'SQL Developer' client_program_name FROM DUAL
    UNION ALL SELECT 'Toad.exe%' FROM DUAL
  ) programs;

COMMIT;
