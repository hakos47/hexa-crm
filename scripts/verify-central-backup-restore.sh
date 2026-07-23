#!/usr/bin/env bash
set -euo pipefail

# Verifies a PostgreSQL backup without ever restoring over the live database.
# Usage: POSTGRES_PASSWORD=... CENTRAL_COMPOSE_PROJECT=hexa-central \
#   bash scripts/verify-central-backup-restore.sh

project="${CENTRAL_COMPOSE_PROJECT:-hexa-central}"
compose=(docker compose -p "$project" -f docker-compose.central.yml)
temporary_db="hexa_crm_restore_check"

cleanup() {
  "${compose[@]}" exec -T db sh -lc "PGPASSWORD=\"\$POSTGRES_PASSWORD\" dropdb -U hexa --if-exists '$temporary_db'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${compose[@]}" ps --status running --services | grep -qx db || {
  echo "The central db service is not running for project $project" >&2
  exit 2
}

cleanup
"${compose[@]}" exec -T db sh -lc "PGPASSWORD=\"\$POSTGRES_PASSWORD\" createdb -U hexa '$temporary_db'"

# A streaming plain dump avoids writing a potentially sensitive backup on disk.
"${compose[@]}" exec -T db sh -lc "PGPASSWORD=\"\$POSTGRES_PASSWORD\" pg_dump -U hexa -d hexa_crm --no-owner --no-privileges" \
  | "${compose[@]}" exec -T db sh -lc "PGPASSWORD=\"\$POSTGRES_PASSWORD\" psql -v ON_ERROR_STOP=1 -U hexa -d '$temporary_db'" >/dev/null

query_restore() {
  "${compose[@]}" exec -T db sh -lc "PGPASSWORD=\"\$POSTGRES_PASSWORD\" psql -U hexa -d '$temporary_db' -At -c \"$1\""
}
schema_version=$(query_restore "SELECT max(version) FROM schema_migrations")
vector_ready=$(query_restore "SELECT extname FROM pg_extension WHERE extname = 'vector'")
if [[ -z "$schema_version" || "$vector_ready" != "vector" ]]; then
  echo "Backup restoration check failed: schema=$schema_version pgvector=$vector_ready" >&2
  exit 1
fi

echo "Backup restoration verified: schema=$schema_version pgvector=$vector_ready"
