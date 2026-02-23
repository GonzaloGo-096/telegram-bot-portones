# Bot modo pantalla única

El bot edita el mismo mensaje en cada paso. Sistema visual coherente: breadcrumbs, separador, 1 botón por fila, íconos por nivel.

## Comportamiento

- **/start** crea el mensaje raíz (home)
- Al tocar botones se **edita** ese mismo mensaje (`editMessageText`)
- **Un botón por fila**
- **Breadcrumb** en cada pantalla
- **Separador** `━━━━━━━━━━━━━━` consistente
- Botones **🏠 Inicio** y **⬅️ Atrás** según pantalla
- `answerCallbackQuery()` siempre
- Fallback: si falla editar → envía nuevo mensaje

## Flujo de pantallas

| Pantalla    | Breadcrumb / texto              | Botones / íconos                     |
|-------------|----------------------------------|--------------------------------------|
| Home        | Hola, {nombre} + Cuenta activa   | 🚪 Portones, 🌱 Cultivos, ℹ️ Ayuda   |
| Grupos      | Inicio › Portones                | 🗂 {grupo}                            |
| Gates       | Inicio › Portones › {grupo}      | 🔐 {gate}                             |
| Gate detail | Inicio › Portones › {grupo}      | 🔐 {nombre}, ID, 🔓 Abrir (próx.)     |
| Ayuda       | ℹ️ Ayuda                         | 🏠 Inicio                             |

## Íconos por nivel

- 🚪 Portones (módulo)
- 🗂 Grupo
- 🔐 Gate/portón individual
- 🔓 Abrir (acción)

## Pasos para probar

1. Levantar backend y bot
2. `/start` → un solo mensaje con Home
3. Tocar **Portones** → pantalla Grupos (breadcrumb, 🗂)
4. Tocar un **grupo** → pantalla Gates (breadcrumb con nombre del grupo, 🔐)
5. Tocar un **gate** → detalle (ID, 🔓 Abrir próximamente)
6. Tocar **Atrás** → vuelve a Gates
7. Tocar **Inicio** → vuelve a Home
8. Tocar **ℹ️ Ayuda** → pantalla Ayuda
9. `/help` → edita mensaje a Ayuda (pantalla única)
10. Verificar: **un solo mensaje** en todo el flujo

## Callback_data

- `NAV:HOME`, `NAV:BACK:GROUPS`, `NAV:BACK:GATES:<grupoId>`
- `mod:portones`, `mod:cultivos`, `mod:ayuda`
- `PORTONES:GROUP:<id>`, `PORTONES:GATE:<id>:GROUP:<gid>`
- `GATE:OPEN:<id>:GROUP:<gid>` – Abrir (próximamente)
