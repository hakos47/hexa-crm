# Despliegue central

1. Guarda `POSTGRES_PASSWORD` y `HEXA_SERVICE_KEYS` en el gestor de secretos de Incus; no los añadas al repositorio.
2. Arranca `docker compose -f docker-compose.central.yml up -d --build`.
3. Espera `GET /api/v1/health` con `database=ok`, `migrations=ready` y `pgvector=ready`.
4. Provisiona cada tenant explícitamente. Ejemplo para Meiga:

```bash
DATABASE_URL='postgresql://…' HEXA_TENANT_CODE=MEIGA \
HEXA_TENANT_LEGAL_NAME='Meiga S.L.' HEXA_TENANT_TRADE_NAME='Meiga' \
npm run central:provision-tenant
```

El modo central no siembra usuarios ni datos demo. Haz backup/restauración en una instancia no productiva antes de publicar una versión; los secretos y las claves HMAC se rotan fuera del repositorio.
