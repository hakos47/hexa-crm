# Sistema de Plugins por Tenant

Los plugins en **HEXA-CRM** extienden las capacidades del sistema y del asistente IA por cada empresa (`company_id`). La administración se realiza desde **Ajustes → Plugins**, garantizando que la activación o configuración de un plugin en un tenant no afecte a los demás.

> [!IMPORTANT]
> Para conocer las especificaciones técnicas y los límites formales entre el CRM Host, los plugins y el agregador, consulta el [Contrato de Integración Host-Plugin](PLUGIN_HOST_CONTRACT.md).

---

## 1. Arquitectura y Agregador Central

El ecosistema de plugins sigue una arquitectura centralizada de agregación mediante submódulos de Git:

- **Agregador Oficial**: `git@github.com:HEXA-NIX/hexa-crm-plugins.git`
- El agregador contiene **únicamente submódulos de Git** pinneados a versiones estables y verificadas de cada plugin.
- El CRM Host no aloja código fuente directo de plugins de terceros en su árbol principal ni compila repositorios sin fijar su SHA.

---

## 2. Separación de Responsabilidades

Para mantener la seguridad y el aislamiento operacional, las responsabilidades se dividen estrictamente entre tres niveles:

| Componente | Responsabilidades |
| :--- | :--- |
| **CRM Host (`hexa-crm`)** | - Aislamiento multi-tenant por `company_id`.<br>- Control de acceso basado en RBAC.<br>- Resolución de referencias a secretos mediante variables de entorno (`HEXA_*`).<br>- Auditoría inmutable en `plugin_audit_log`.<br>- Exigencia de confirmación humana obligatoria para acciones de escritura o alto privilegio. |
| **Repositorio de Plugin** | - Código fuente desacoplado e implementación de handlers.<br>- Definición de esquemas de herramientas y tipos.<br>- Control de versión e integración propia. |
| **Agregador (`hexa-crm-plugins.git`)** | - Registro exclusivo de referencias `.gitmodules` y gitlinks.<br>- Sin código de ejecución en el directorio raíz. |

---

## 3. Política de Seguridad: Prohibición de Código Remoto Arbitrario

Queda **estrictamente prohibido** cargar o ejecutar código remoto de forma dinámica en tiempo de ejecución:

- No se permite el uso de `eval()`, descargas dinámicas de scripts desde URLs/CDNs externas, ni invocación de binarios no verificados en runtime.
- Todo el código ejecutado debe estar contenido dentro de los submódulos pinneados en el agregador, auditado previamente e integrado determinísticamente durante la etapa de compilación y despliegue del Host.

---

## 4. Gestión de Secretos

El CRM Host guarda únicamente el **nombre de la variable de entorno** referenciada. Nunca persiste contraseñas, API keys, credenciales o tokens OAuth en las tablas del tenant (`tenant_plugins`).

Ejemplo de configuración en el entorno del servicio:

```env
HEXA_PLUGIN_DATABASE_SHOP_URL=postgresql://usuario:clave@host:5432/tienda
HEXA_STRIPE_SHOP_TOKEN=rk_test_...
```

Tras añadir o rotar una referencia a secreto, es necesario reiniciar el servicio y ejecutar **Probar conexión**.

---

## 5. Plugins Integrados y Estrategia de Transición

Actualmente, el sistema cuenta con dos plugins principales:

- **Base de datos externa (`database_bridge`)**: Conexión PostgreSQL independiente por tenant. Se mantiene in-tree (`src/lib/plugins/`). Modo recomendado inicial: `read_only`.
- **Stripe MCP (`stripe_mcp`)**: Integración con las herramientas de Stripe MCP (`https://mcp.stripe.com`). Extraído e integrado como submódulo externo mediante `vendor/hexa-crm-plugins` -> `plugins/stripe`, ambos pinneados por SHA de commit inmutable. Requiere confirmación humana explícita para operaciones de escritura.

### Inicialización y Actualización de Submódulos

Al clonar el repositorio o actualizar las dependencias de plugins externos, ejecute:

```bash
git submodule update --init --recursive
```

### Plan de Transición de Plugins Locales
> [!NOTE]
> El plugin `stripe_mcp` ya ha sido extraído al agregador externo en `vendor/hexa-crm-plugins/plugins/stripe` fijado por SHA. La extracción de `database_bridge` hacia su propio repositorio independiente permanece in-tree hasta su posterior fase de migración.

---

## 6. Referencias

- Especificación detallada de interfaces, puertas de validación y estructura de submódulos: [PLUGIN_HOST_CONTRACT.md](PLUGIN_HOST_CONTRACT.md).
- Migración de base de datos para plugins: `0013_tenant_plugins.sql` (tablas `tenant_plugins` y `plugin_audit_log`).
