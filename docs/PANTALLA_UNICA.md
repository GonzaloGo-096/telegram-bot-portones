# Bot modo pantalla única

El bot edita el mismo mensaje en cada paso en lugar de enviar mensajes nuevos.

## Comportamiento

- **/start** crea el mensaje raíz (home)
- Al tocar Portones / Cultivos / Grupos / Gates se **edita** ese mismo mensaje (`editMessageText`)
- Botones **🏠 Inicio** y **⬅️ Atrás** según la pantalla
- `answerCallbackQuery()` se llama siempre para evitar loading infinito
- Si falla la edición (mensaje no encontrado), se envía un mensaje nuevo y se sigue

## Flujo de pantallas

| Pantalla    | Texto                                      | Navegación                         |
|------------|---------------------------------------------|------------------------------------|
| Home       | Hola, {nombre} 👋\nBienvenido...\nElegí un módulo | —                                   |
| Grupos     | Elegí un grupo de portones:                 | ⬅️ Atrás, 🏠 Inicio                 |
| Gates      | Portones en "{grupo}":                      | ⬅️ Atrás, 🏠 Inicio                 |
| Gate detail| 🚪 {nombre}\n\n/abrir {id} (modo avanzado)   | ⬅️ Atrás, 🏠 Inicio                 |
| Cultivos   | Módulo Cultivos activo. Próximamente...     | ⬅️ Atrás, 🏠 Inicio                 |

## Archivos modificados

- `src/bot/commands.js`: Helper `upsertScreen`, `rootByChatId`, renders y handlers refactorizados

## Cómo probar

1. Levantar backend y bot
2. Enviar `/start` al bot
3. Confirmar que solo hay **un mensaje** con botones
4. Tocar "Portones" → el mensaje se actualiza (mismo mensaje, nuevo texto y botones)
5. Tocar un grupo → se actualiza a la lista de gates
6. Tocar un gate → detalle con instrucción `/abrir {id}`
7. Tocar "Atrás" → vuelve a la pantalla anterior
8. Tocar "Inicio" → vuelve al home
9. Verificar que el chat sigue mostrando **un solo mensaje** en cada paso

## Callback_data

- `NAV:HOME` – ir al home
- `NAV:BACK:GROUPS` – volver a la lista de grupos
- `NAV:BACK:GATES:<grupoId>` – volver a la lista de gates del grupo
- `mod:portones`, `mod:cultivos` – módulos
- `PORTONES:GROUP:<id>` – listar gates del grupo
- `PORTONES:GATE:<id>:GROUP:<gid>` – detalle del gate
