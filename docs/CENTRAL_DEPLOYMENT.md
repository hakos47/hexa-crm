# Despliegue central

1. Guarda `POSTGRES_PASSWORD`, `HEXA_SERVICE_KEYS` y un `HEXA_MIGRATION_TOKEN` largo en el gestor de secretos de Incus; no los añadas al repositorio.
2. Arranca `docker compose -f docker-compose.central.yml up -d --build` con la conexión propietaria por defecto (`hexa`) sólo para esta fase.
3. Ejecuta una vez la migración autenticada desde el job de despliegue: `curl -X POST -H "Authorization: Bearer $HEXA_MIGRATION_TOKEN" http://127.0.0.1:3001/api/v1/admin/migrate`.
4. Espera `GET /api/v1/health` con `database=ok`, `migrations=ready` y `pgvector=ready`.
5. Provisiona cada tenant explícitamente. Ejemplo para Meiga:

```bash
DATABASE_URL='postgresql://…' HEXA_TENANT_CODE=MEIGA \
HEXA_TENANT_LEGAL_NAME='Meiga S.L.' HEXA_TENANT_TRADE_NAME='Meiga' \
npm run central:provision-tenant
```

El modo central no siembra usuarios ni datos demo. Haz backup/restauración en una instancia no productiva antes de publicar una versión; los secretos y las claves HMAC se rotan fuera del repositorio.

Antes de servir tráfico, crea el rol restringido: `npm run central:provision-api-role` con una conexión propietaria y `HEXA_API_DB_USER` / `HEXA_API_DB_PASSWORD`. Configura después `HEXA_API_DATABASE_URL` para que la API use ese rol, no el propietario, y recrea el servicio `api`. Las futuras migraciones se ejecutan temporalmente con conexión propietaria y el mismo endpoint; nunca se exponen al tráfico de tenants.

Las tablas comerciales tienen RLS por `company_id`. La API central fija `app.company_id` con `SET LOCAL` dentro de cada transacción; el rol no propietario hace que PostgreSQL aplique esas políticas.
