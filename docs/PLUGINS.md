# Plugins por tenant

Los plugins se administran desde **Ajustes → Plugins**. Su estado y configuración se guardan por `company_id`, de modo que activar Stripe en una tienda no lo activa en las demás.

## Secretos

El CRM guarda únicamente el nombre de una variable de entorno. Nunca persiste URLs con contraseña, API keys ni tokens OAuth en `tenant_plugins`.

Ejemplo para el servicio web:

```env
HEXA_PLUGIN_DATABASE_SHOP_URL=postgresql://usuario:clave@host:5432/tienda
HEXA_STRIPE_SHOP_TOKEN=rk_test_...
```

Tras añadir o rotar un secreto, reinicia el servicio y usa **Probar conexión**.

## Base de datos externa

El plugin verifica una conexión PostgreSQL independiente. El modo recomendado para centralización inicial es `read_only`. Cada tenant puede apuntar a una base distinta usando una variable diferente.

## Stripe MCP

El endpoint está fijado a `https://mcp.stripe.com`. Para agentes autónomos debe usarse una clave restringida con el mínimo permiso necesario.

- Las consultas autorizadas pueden ejecutarse desde el asistente.
- Las herramientas de escritura se bloquean hasta que un administrador las habilite.
- Cada escritura necesita además confirmación explícita en la conversación.
- Las invocaciones se registran en `plugin_audit_log` sin guardar argumentos ni secretos.

La migración aditiva correspondiente es `0013_tenant_plugins` y crea `tenant_plugins` y `plugin_audit_log` sin modificar tablas comerciales existentes.

Stripe MCP está en public preview; valida el flujo en sandbox antes de seleccionar producción.
