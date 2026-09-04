-- Consultar luego de una prueba de conexion bloqueada o permitida.
-- Sirve para identificar la IP real del GitLab Runner y cargarla en DBUP_ALLOWED_CLIENTS.

SELECT
  LOGIN_ID,
  EVENT_AT,
  SESSION_USER,
  OS_USER,
  HOST,
  IP_ADDRESS,
  MODULE,
  CLIENT_ID,
  ALLOWED,
  BLOCK_REASON
FROM DBUP_LOGIN_AUDIT
WHERE SESSION_USER = '&&DBUP_USER'
ORDER BY LOGIN_ID DESC
FETCH FIRST 20 ROWS ONLY;

-- Una vez identificada la IP correcta, cargarla de forma controlada:
--
-- INSERT INTO DBUP_ALLOWED_CLIENTS (
--   ENVIRONMENT,
--   IP_ADDRESS,
--   OS_USER,
--   DESCRIPTION,
--   ENABLED
-- ) VALUES (
--   'DEV',
--   '<IP_DEL_RUNNER>',
--   '<OS_USER_DEL_RUNNER>',
--   'GitLab runner DEV DBUP',
--   'Y'
-- );
--
-- COMMIT;
