# Herramientas (tools)

Utilidades que rodean el CRM Nix-C y se mantienen **separadas del core** de la app para poder arreglarlas o versionarlas sin mezclar UI/Svelte.

| Carpeta | Qué es |
|---------|--------|
| [`mcp/`](./mcp/) | Servidor **MCP** (Model Context Protocol): cada acción del agente en un archivo |

## MCP

Ver [mcp/README.md](./mcp/README.md) para instalar, variables de entorno y cómo conectar Grok/Cursor por `stdio` o URL.
