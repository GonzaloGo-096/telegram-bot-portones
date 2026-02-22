# Casos de Prueba Bot Telegram (flujo jerárquico)

## Variables previas

- `BOT_TOKEN`
- `BACKEND_BASE_URL`
- `TELEGRAM_BOT_INTERNAL_SECRET`

## Caso 1: carga de menú con módulos activos

1. En Telegram, enviar `/start`.
2. Resultado esperado en chat: bienvenida + botones inline de módulos activos.
3. Verificar que solo aparezcan módulos devueltos por backend.

## Caso 2: navegación módulos -> grupos -> portones

1. Presionar `Portones`.
2. Deben mostrarse grupos permitidos.
3. Presionar un grupo.
4. Deben mostrarse portones de ese grupo.
5. Debe existir botón `🔙 Volver` en cada nivel.

## Caso 3: apertura exitosa

1. Presionar un botón de portón habilitado.
2. Resultado esperado en chat: `✅ Comando enviado`.
3. Resultado esperado backend: HTTP `200` en `POST /api/telegram/bot/portones/:id/abrir`.

## Caso 4: usuario sin acceso al portón

1. Presionar un portón no autorizado (forzando callback o con backend de prueba).
2. Resultado esperado en chat: `⚠️ Sin permisos`.
3. Resultado esperado backend: HTTP `403`.

## Caso 5: comando repetido (debounce)

1. Presionar el mismo portón dos veces de inmediato.
2. Resultado esperado segundo intento: `⏱ Debounce (esperar antes de enviar de nuevo)`.
3. Resultado esperado backend: HTTP `429`.

## Caso 6: secret interno faltante o inválido

1. Remover o invalidar `TELEGRAM_BOT_INTERNAL_SECRET`.
2. Intentar abrir un portón.
3. Resultado esperado backend: HTTP `401`.
4. Resultado esperado en chat: `⚠️ Error interno de autenticación del bot.`
