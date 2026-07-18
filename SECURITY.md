# Política de seguridad

## Versiones soportadas

Durante la fase pre-1.0 solo se mantiene la última versión publicada y la rama `main`.

## Reportar una vulnerabilidad

No publiques vulnerabilidades explotables, secretos ni datos reales en una issue pública. Usa el reporte privado de seguridad de GitHub cuando esté habilitado. Si no está disponible, contacta al mantenedor mediante un canal privado indicado en su perfil de GitHub.

Incluye:

- versión o commit afectado;
- entorno y pasos mínimos de reproducción;
- impacto observable;
- prueba de concepto segura y sin datos de terceros;
- mitigación propuesta, si existe.

## Alcance prioritario

- autenticación, sesiones y credenciales temporales;
- lectura o modificación no autorizada de datos locales;
- inyección en comandos Tauri, SQLite u Ollama;
- manipulación de ventas, caja, impuestos o auditoría;
- actualización de aplicación y dependencias;
- pérdida, corrupción o exposición de backups.

No se garantiza recompensa económica. Se reconocerá la contribución cuando sea seguro y la persona reportante lo autorice.
