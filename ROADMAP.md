# Roadmap — hexa-crm

Este roadmap prioriza evidencia, seguridad y una base fiscal auditable. Las fechas son objetivos, no promesas comerciales.

## Norte del producto

Permitir que un microcomercio español instale la aplicación, configure su negocio y complete su primera venta en menos de 15 minutos, manteniendo sus datos bajo control local.

## Fase 0 — Base de ingeniería (ahora)

**Objetivo:** hacer que cada cambio sea revisable y repetible.

- CI obligatorio: check, test y build.
- Plantillas de issues y PR.
- Política de seguridad y contribución.
- Dependabot y revisión semanal de dependencias.
- Backlog priorizado y criterios de aceptación.
- Protección de `main` en GitHub.

**Salida:** ningún cambio llega a `main` sin PR y CI verde.

## Fase 1 — MVP fiable (0.2)

**Objetivo:** operación diaria estable para una sola tienda.

- Onboarding de negocio y parámetros fiscales.
- Importación/exportación CSV robusta.
- Backups, restauración y migraciones versionadas.
- Auditoría de ventas, caja y cambios sensibles.
- Tests de integración browser/Tauri.
- Accesibilidad y flujos por teclado en TPV.
- Gestión de errores y recuperación ante fallos.

**Criterios de salida:** cinco comercios piloto; cero pérdida de datos en pruebas de recuperación; primera venta <15 min.

## Fase 2 — Piloto comercial (0.3)

**Objetivo:** validar uso recurrente y soporte.

- Instaladores firmados y actualización segura.
- Telemetría opt-in y respetuosa con privacidad.
- Informes de margen, rotación y stock.
- Roles y permisos completos.
- Gestión de devoluciones y anulaciones.
- Documentación operativa y diagnóstico exportable.

**Criterios de salida:** cinco pilotos activos durante ocho semanas y resolución de incidencias críticas <24 h.

## Fase 3 — Preparación fiscal española (0.4)

**Objetivo:** implementar una arquitectura compatible con los requisitos aplicables, sin hacer afirmaciones prematuras.

- Registros encadenados e inalterables.
- Identificación de software y versiones.
- Registro de eventos y trazabilidad.
- Generación de QR y formatos exigidos.
- Cola durable para remisión y reintentos.
- Exportación, conservación y verificaciones de integridad.
- Declaración responsable y revisión jurídica/técnica externa.

**Criterio de salida:** matriz de requisitos completa, pruebas reproducibles y aprobación externa antes de anunciar conformidad.

## Fase 4 — Escala controlada (1.0)

**Objetivo:** producto soportable para adopción amplia.

- Multi-tienda opcional.
- Sincronización cifrada y resolución de conflictos.
- API e integraciones de pagos/ecommerce.
- Canal estable, beta y nightly automatizados.
- SLA, soporte y programa de partners.

## Fuera de alcance inmediato

- Contabilidad financiera completa.
- Nóminas y RR. HH.
- Hostelería compleja con mesas/cocina.
- Marketplace de extensiones.
- IA cloud obligatoria.

## Métricas

- Activación: negocio creado + producto + primera venta.
- Tiempo a primera venta.
- Comercios activos semanalmente.
- Porcentaje de cierres de caja sin descuadre.
- Recuperaciones de backup exitosas.
- Errores críticos por 1.000 ventas.
- Tiempo de ciclo issue → PR → merge.
