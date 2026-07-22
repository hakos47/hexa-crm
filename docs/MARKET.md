# Análisis de mercado — hexa-crm

Fecha de referencia: 2026-07-18.

## Tesis de producto

Hexa CRM debe posicionarse como **sistema local-first de TPV y gestión para microcomercios españoles**, no como CRM horizontal.

Propuesta de valor:

- Datos y operación local, incluso sin conexión.
- Coste operativo bajo y sin nube obligatoria.
- TPV, inventario, caja, clientes e impuestos en una sola aplicación.
- Privacidad por diseño e IA local opcional.
- Camino explícito y auditable hacia cumplimiento fiscal español.

## Cliente ideal inicial

Comercios de 1 a 10 empleados con uno o pocos puntos de venta:

- tiendas de alimentación y especializadas;
- bazares, librerías, ferreterías y comercios de barrio;
- autónomos con inventario y venta presencial;
- negocios que valoran control local de los datos y costes previsibles.

No se prioriza inicialmente hostelería compleja, ecommerce multicanal, contabilidad completa ni grandes cadenas.

## Problemas validados del mercado

1. Herramientas completas como ERP generalistas tienen una curva de aprendizaje y coste de implantación altos.
2. Los TPV cloud simples reducen fricción, pero generan dependencia de conectividad y proveedor.
3. La adaptación a los requisitos de sistemas informáticos de facturación en España crea urgencia y riesgo percibido.
4. Los pequeños comercios necesitan resultados inmediatos: vender, cuadrar caja, controlar stock y conocer margen.
5. La IA solo aporta valor si trabaja con datos útiles sin exponer información sensible ni añadir costes variables impredecibles.

## Competidores y diferenciación

| Categoría | Ejemplos | Ventaja rival | Hueco para Hexa CRM |
|---|---|---|---|
| ERP/gestión cloud | Holded, Odoo | amplitud funcional e integraciones | menor complejidad, local-first, instalación rápida |
| TPV cloud | SumUp, Square, FactuTPV | onboarding y pagos integrados | independencia de proveedor, offline real, privacidad |
| Facturación para autónomos | Billin, Anfix, Contasimple | fiscalidad y colaboración con gestoría | TPV e inventario operativo en escritorio |
| TPV vertical | Revo, Last.app | flujos especializados | foco en comercio general y menor complejidad |
| Open source ERP | ERPNext, Dolibarr | extensibilidad y comunidad | UX específica, escritorio local y menor coste de operación |

## Principios estratégicos

1. **Cumplimiento antes que marketing fiscal.** No afirmar compatibilidad VeriFactu hasta disponer de diseño, pruebas, declaración responsable y revisión especializada.
2. **Offline primero.** Toda venta debe poder completarse sin internet; sincronización y remisión fiscal se diseñan como colas durables.
3. **Tiempo a primera venta menor de 15 minutos.** Instalación, negocio, impuestos, primer producto y primera venta.
4. **Migración sencilla.** Importación y exportación CSV documentadas; copias de seguridad verificables.
5. **Métricas de negocio, no vanidad.** Activación, ventas registradas, cierres de caja sin descuadre, retención semanal y errores críticos.

## Modelo de negocio recomendado

- Community: aplicación local gratuita y código abierto.
- Pro: actualizaciones firmadas, backups gestionados, soporte y módulos fiscales certificados.
- Partner: despliegue, formación y soporte para asesorías e instaladores.

Evitar monetizar mediante venta de datos o comisiones sobre ventas.

## Riesgos principales

- Riesgo regulatorio si se presenta como software de facturación conforme antes de estarlo.
- Seguridad de credenciales y datos locales.
- Corrupción o pérdida de SQLite sin backups y migraciones robustas.
- Diferencias funcionales entre fallback web y Tauri.
- Alcance excesivo frente a un equipo pequeño.

## Evidencia y validación necesaria

Antes de ampliar el alcance:

- 10 entrevistas con comercios del segmento inicial.
- 5 instalaciones supervisadas.
- Medición de tiempo hasta primera venta.
- Registro de las 20 tareas más repetidas.
- Prueba de recuperación de backup en cada release.
- Revisión fiscal/técnica externa antes de declarar cumplimiento.

## Criterios de éxito del MVP comercial

- 80 % completa onboarding sin ayuda.
- Primera venta en menos de 15 minutos.
- 99,9 % de operaciones monetarias conservan invariantes de céntimos e IVA.
- Cierre de caja reproducible y auditable.
- Cero pérdida de datos en pruebas de corte y recuperación.
- 5 comercios usan el producto semanalmente durante 8 semanas.
