# Perfil Maestro

`users.is_master` es una capacidad adicional al rol `admin`. No se infiere del nombre, correo ni `display_name`.

- La vista inicial contiene únicamente las empresas asignadas en `company_members`.
- El botón **Todas** de la cabecera solicita el catálogo global de tenants.
- Solo un perfil con `is_master = TRUE` puede usar `list_companies(include_all)` o cambiar a una empresa no asignada.
- Al volver a **Mis empresas**, si el tenant activo no está asignado, el CRM cambia a la primera empresa propia antes de recargar.

La migración aditiva `0014_master_profile` añade la columna booleana con valor `FALSE` por defecto. La promoción a Maestro debe hacerse mediante un procedimiento administrativo auditado; no está disponible en la pantalla ordinaria de gestión de usuarios.
