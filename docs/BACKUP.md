# Copias de seguridad y restauración (issue #4)

## Objetivo

Evitar pérdida de datos de negocio por fallo local, migración o error humano.

## Formato

| Campo | Valor |
|-------|--------|
| Formato | `hexa-crm-backup` |
| Versión | `1` |
| Integridad | SHA-256 del JSON canónico del `payload` |
| Módulo | `src/lib/backup/backup.ts` |

## Operaciones

1. **Exportar:** `createBackupEnvelope(store)` → JSON descargable.
2. **Validar:** `validateBackup` / `parseBackupJson` — rechaza formato, versión o checksum incorrectos.
3. **Restaurar:** solo tras `ok: true`; sustituye el store de aplicación.
4. **Pre-migración:** `createPreMigrationBackup(store, reason)` antes de cambios de esquema.

## Retención (recomendado tienda)

| Tipo | Retención | Ubicación |
|------|-----------|-----------|
| Manual diaria | 30 días | Disco externo / nube encriptada |
| Pre-migración | 90 días | Misma + copia off-site |
| Pre-release | Indefinida | Repo/artefacto release (sin secretos) |

**RPO local objetivo:** ≤ 24 h (copia diaria).  
**RTO validado:** restore en &lt; 10 min con JSON + validación checksum.

## SQLite (Tauri) / PostgreSQL (web)

| Backend | Estrategia actual |
|---------|-------------------|
| Browser `localStorage` | Envelope JSON (implementado + tests) |
| SQLite desktop | Copiar archivo DB + integrity_check (Rust, futuro comando) |
| Postgres Docker | `pg_dump` / restore (ops; documentado) |

```bash
# Postgres (contenedor nix-c-postgres)
docker exec nix-c-postgres pg_dump -U hakos nix_crm > backup-$(date +%F).sql
```

## Pruebas

`src/lib/backup/backup.test.ts` — create, round-trip, corrupción, pre-migración.

## Mensajes de error útiles

- JSON mal formado  
- Formato desconocido  
- Versión no soportada  
- Checksum no coincide  
