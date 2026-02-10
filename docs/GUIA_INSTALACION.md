# Guía de instalación - Paso a paso

## Archivos generados y ubicación

Todos los archivos están listos en el proyecto. No es necesario copiar nada manualmente; la estructura ya está creada.

### Resumen de archivos

| Archivo | Ubicación | ¿Reemplaza existente? |
|---------|-----------|------------------------|
| `src/index.js` | Raíz del proyecto | Sí (el antiguo `index.js` en raíz) |
| `src/bot/bot.js` | Bot principal | Sí (el antiguo `bot.js` en raíz) |
| `src/bot/commands/start.js` | Comando /start | No (nuevo) |
| `src/bot/commands/openGate.js` | Lógica abrir portón | No (nuevo) |
| `src/bot/commands/feedback.js` | Endpoint feedback | Sí (el antiguo `feedback.js` en raíz) |
| `src/bot/callbacks/tenantSelection.js` | Callback tenant | No (nuevo) |
| `src/bot/callbacks/gateSelection.js` | Callback gate | No (nuevo) |
| `src/db/index.js` | Pool PostgreSQL | No (nuevo) |
| `src/db/queries.js` | Queries parametrizadas | No (nuevo) |
| `src/utils/controladorClient.js` | Cliente Controlador | Sí (el antiguo `controladorClient.js` en raíz) |
| `src/utils/jwt.js` | Utilidades JWT | No (nuevo) |
| `src/utils/permissions.js` | Validación permisos | No (nuevo) |
| `.env.example` | Variables de entorno | Sí (actualizado) |
| `package.json` | Dependencias | Sí (añadido `pg`, main actualizado) |
| `README.md` | Documentación | Sí |
| `docs/SCHEMA.sql` | Esquema DB | No (nuevo) |

## Pasos para migrar

1. **Hacer backup del `.env`**  
   Guarda una copia de tu `.env` actual.

2. **Añadir `DATABASE_URL` al `.env`**  
   ```
   DATABASE_URL=postgresql://user:password@host:5432/database
   ```

3. **Ejecutar el esquema si la DB no tiene las tablas**  
   ```bash
   psql $DATABASE_URL -f docs/SCHEMA.sql
   ```

4. **Instalar dependencias**  
   ```bash
   npm install
   ```

5. **Eliminar archivos antiguos en raíz** (opcional, si quieres limpiar):  
   - `index.js` (raíz) → reemplazado por `src/index.js`  
   - `bot.js` (raíz)  
   - `controladorClient.js` (raíz)  
   - `feedback.js` (raíz)  

6. **Iniciar el bot**  
   ```bash
   npm start
   ```

## Comprobar que funciona

1. `GET /health` devuelve `ok: true`.
2. En Telegram, envía `/start` al bot.
3. Deberías ver los edificios (tenants) a los que tienes acceso.
4. Si no ves ninguno, verifica que:
   - Existe un usuario en `users` con tu `telegram_user_id`.
   - Existe al menos un registro en `user_tenants` vinculando ese usuario a un tenant.
   - Existe al menos un registro en `user_gates` para un gate de ese tenant.

## Crear datos de prueba

```sql
-- Usuario (ajusta telegram_user_id con tu ID de Telegram)
INSERT INTO users (telegram_user_id, username) VALUES ('123456789', 'tu_usuario');

-- Tenant
INSERT INTO tenants (name) VALUES ('Edificio Principal') RETURNING id;

-- user_tenants (usa el user_id y tenant_id correctos)
INSERT INTO user_tenants (user_id, tenant_id) VALUES (1, 1);

-- Gate
INSERT INTO gates (tenant_id, name, controller_id) VALUES (1, 'Portón 1', 'porton1');

-- user_gates
INSERT INTO user_gates (user_id, gate_id) VALUES (1, 1);
```
