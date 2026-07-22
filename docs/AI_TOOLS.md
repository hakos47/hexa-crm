# Herramientas del copiloto local

El endpoint autenticado `/api/ai/stream` obtiene los datos con las mismas APIs del CRM y los limita a la empresa activa de la sesión. Después entrega a Ollama local cuatro resultados deterministas:

- `get_dashboard_stats`: ventas de hoy y del mes, tickets y saldo de caja.
- `list_low_stock`: productos que están en o bajo su mínimo.
- `sales_summary`: tickets válidos, venta neta y la última venta registrada.
- `suggest_reorder`: propuesta local de unidades para reponer.

Ollama explica esos resultados; no puede inventar cifras fuera de ese contexto. Las consultas y el modelo se ejecutan en la instalación local configurada, sin un proveedor de IA en nube. Si Ollama no responde, el TPV y el resto del CRM siguen operativos y el panel muestra el estado offline.

Los importes fiscales se presentan como información operativa y no como asesoramiento legal o fiscal.
