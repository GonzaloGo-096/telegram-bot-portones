# Casos de Prueba Bot Telegram (`/abrir`)

## Variables previas

- `BOT_TOKEN`
- `BACKEND_BASE_URL`
- `TELEGRAM_USER_JWT_MAP` (JSON con `telegramId -> jwt`)

Ejemplo:

```env
TELEGRAM_USER_JWT_MAP={"111111111":"<JWT_SUPERADMIN>","222222222":"<JWT_ADMIN_CUENTA>","333333333":"<JWT_OPERADOR>"}
```

## Caso 1: superadministrador abre cualquier porton -> OK

1. En Telegram (usuario `111111111`): enviar `/abrir 10`.
2. Resultado esperado en chat: `✅ Portón abierto correctamente.`
3. Resultado esperado backend: HTTP `200` y evento en `eventos_porton` con `canal = "telegram"`.

## Caso 2: administrador_cuenta abre porton de su cuenta -> OK

1. En Telegram (usuario `222222222`): enviar `/abrir <porton_de_su_account_id>`.
2. Resultado esperado en chat: `✅ Portón abierto correctamente.`
3. Resultado esperado backend: HTTP `200`, scoping por `account_id` correcto y evento `canal = "telegram"`.

## Caso 3: operador abre porton asignado -> OK

1. En Telegram (usuario `333333333`): enviar `/abrir <porton_asignado_al_operador>`.
2. Resultado esperado en chat: `✅ Portón abierto correctamente.`
3. Resultado esperado backend: HTTP `200` y evento `canal = "telegram"`.

## Caso 4: operador abre porton no asignado -> 403

1. En Telegram (usuario `333333333`): enviar `/abrir <porton_no_asignado>`.
2. Resultado esperado en chat: `⛔ No tenés permiso para abrir este portón.`
3. Resultado esperado backend: HTTP `403` y sin apertura.

## Caso 5: doble intento inmediato -> 429

1. En Telegram (usuario autorizado): enviar dos veces seguidas `/abrir <porton_valido>`.
2. Resultado esperado primer comando: `✅ Portón abierto correctamente.`
3. Resultado esperado segundo comando inmediato: `⏱️ Ya se envió una apertura hace instantes...`
4. Resultado esperado backend: primer request `200`, segundo request `429` por debounce (Redis, ventana ~2s).
