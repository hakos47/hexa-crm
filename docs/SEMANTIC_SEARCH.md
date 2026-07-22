# Índice semántico privado

El índice central usa `pgvector` y embeddings locales de `nomic-embed-text` (768 dimensiones). En v1 sólo admite documentos de `product`, `evidence`, `proposal` y `review`; el `CHECK` de PostgreSQL y `canIndexSemanticEntity` bloquean clientes, ventas y notas privadas.

Cada documento se identifica por tenant, entidad y versión. Reindexar la misma versión no duplica filas. Si Ollama falla, el documento queda `pending` o `failed`: el CRM sigue disponible y la búsqueda semántica debe comunicar la degradación explícitamente.

La API central usa `HEXA_OLLAMA_URL` y `HEXA_EMBEDDING_MODEL` (`nomic-embed-text` por defecto). Ollama vive en la red privada de Incus; no se publica por el puerto de la API. La ruta de indexación rechaza vectores con una dimensión distinta de 768 y nunca acepta tipos `customer`, `sale` ni notas privadas.
