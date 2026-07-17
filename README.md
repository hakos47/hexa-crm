# Nix-C — Gestión de tienda local

CRM / ERP ligero para tienda: **inventario**, **ventas (TPV)**, **caja**, **clientes**, **IVA España** e **asistente IA con Ollama**.

Diseñado para **consumo mínimo** (local-first, SQLite, modelos Ollama pequeños) y UI **moderna dark glass** con animaciones fluidas (Svelte 5).

> **Convenciones del proyecto** (ramas, nightlies, carpetas, dónde tocar cada cosa): ver **[AGENTS.md](./AGENTS.md)**.  
> Remoto: [hakos47/hexa-crm](https://github.com/hakos47/hexa-crm).

## Stack

| Capa | Tech |
|------|------|
| UI | Svelte 5 + SvelteKit + Tailwind CSS 4 |
| Desktop | Tauri 2 + SQLite (`rusqlite`) |
| IA | Ollama local (`qwen3.5:4b` por defecto) |
| Dev web | Fallback `localStorage` sin Tauri |

## Requisitos

- Node.js 20+
- Rust (para Tauri)
- [Ollama](https://ollama.com) (opcional, solo para el asistente)

```bash
# modelo recomendado (bajo consumo)
ollama pull qwen3.5:4b
```

## Arranque

```bash
cd nix-c
npm install

# UI en navegador (datos en localStorage + seed demo)
npm run dev
# → http://localhost:1420

# App de escritorio (SQLite nativo)
npm run tauri:dev
```

## Acceso (auth) — obligatorio

Sin sesión válida **no se puede** ver ni modificar datos (UI y API).

### Credenciales seed (demo)

| Usuario | PIN | Rol |
|---------|-----|-----|
| `admin` | `1234` | Administrador |
| `cajero` | `0000` | Cajero |

### Usuarios nuevos

1. El admin crea el usuario en **Ajustes** → se genera una **contraseña temporal de 14 caracteres** (se muestra una sola vez).
2. El usuario entra con esa temporal **en menos de 24 h**.
3. Nada más entrar se le **obliga a cambiar** la contraseña antes de usar el CRM.
4. Si pasan 24 h sin cambio, el login se **rechaza** hasta que el admin regenere una temporal.

- Layout **responsive** (menú hamburguesa en móvil, grids apilados, tablas con scroll)
- Token de sesión obligatorio en operaciones de negocio

## Módulos MVP

- **Dashboard** — ventas hoy/mes, caja, IVA, alertas de stock
- **Inventario** — productos con IVA 0/4/10/21, stock y mínimos
- **Ventas** — TPV con carrito, desglose base/IVA/total (PVP con IVA incluido)
- **Caja** — saldo = ingresos − gastos; movimientos manuales
- **Clientes** — CRM ligero
- **Impuestos** — libro IVA simplificado por periodo
- **Asistente IA** — contexto compacto de tienda vía Ollama

## IVA (España)

Precios de venta **con IVA incluido**. Tipos:

| Tipo | % |
|------|---|
| General | 21 |
| Reducido | 10 |
| Superreducido | 4 |
| Exento | 0 |

> Control **interno**. No sustituye software de facturación homologado AEAT / Verifactu.

## Scripts

```bash
npm run dev          # frontend
npm run build        # build estático
npm run test         # tests IVA / money
npm run tauri:dev    # app nativa
npm run tauri:build  # empaquetado
```

## Principios de consumo

1. Todo local (sin cloud obligatorio)
2. IA solo bajo demanda (panel asistente)
3. Contexto JSON acotado al modelo (no dump de BD)
4. Modelo pequeño por defecto
5. Animaciones CSS / Svelte (sin librerías pesadas)
