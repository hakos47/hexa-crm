# Índice semántico privado

El índice central usa `pgvector` y embeddings locales de `nomic-embed-text` (768 dimensiones). En v1 sólo admite documentos de `product`, `evidence`, `proposal` y `review`; el `CHECK` de PostgreSQL y `canIndexSemanticEntity` bloquean clientes, ventas y notas privadas.

Cada documento se identifica por tenant, entidad y versión. Reindexar la misma versión no duplica filas. Si Ollama falla, el documento queda `pending` o `failed`: el CRM sigue disponible y la búsqueda semántica debe comunicar la degradación explícitamente.
