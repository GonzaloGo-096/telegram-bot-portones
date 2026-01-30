# Análisis 404 en Vercel – /api/bot

## 1. Estructura real del proyecto

### Qué hay en el repositorio

| Elemento | Estado |
|----------|--------|
| **Vercel Serverless Functions** | Sí: se usa el modelo `/api/*.js` de Vercel. |
| **Express** | No: no hay `express`, ni `app.listen()`, ni servidor HTTP propio. |
| **Mezcla incorrecta** | No: solo hay handler serverless. |

**Archivo que define el endpoint:**

- Existe **`api/bot.js`** en la raíz del repo (no en `src/`).
- Contiene `export default async function handler(req, res)` (líneas 57–124).
- No hay `app.listen()` ni otro servidor; solo ese handler.

**Conclusión:** La estructura es la correcta para Vercel: un solo archivo de función en `api/bot.js` con `export default handler`.

---

## 2. Origen del 404

El 404 en **`/api/bot`** no se debe a:

- Estructura de carpetas (la carpeta es `api/`, no `src/api/`).
- Uso de Express ni de `app.listen()`.
- Falta de `export default` (sí existe).
- Ruta mal definida en `vercel.json` (solo se ajusta `maxDuration`; la ruta es la por defecto `/api/bot`).
- Build que genere otra salida: no hay `build` que reemplace las Serverless Functions.

Se debe a:

**Fallar la carga del módulo `api/bot.js` (inicialización).**

En `api/bot.js`, líneas 17–19:

```javascript
if (!process.env.BOT_TOKEN) {
  throw new Error("BOT_TOKEN no está definido en las variables de entorno de Vercel");
}
```

Ese código se ejecuta al **cargar el módulo** (al importar el archivo), no dentro del handler. En Vercel:

1. La primera vez que se invoca `/api/bot`, Vercel carga el módulo.
2. Si `BOT_TOKEN` no está definido en el entorno del deployment, se lanza la excepción.
3. El módulo no termina de cargar y la función no se registra como válida.
4. La petición a `/api/bot` no encuentra una función ejecutable → **404**.

Por tanto: **404 en `/api/bot` = función que no llega a estar disponible porque el módulo lanza en tiempo de carga cuando falta `BOT_TOKEN`.**

El **404 en `/`** es esperado: no existe handler para la raíz (ni `index.html` ni función en `/api` para `/`).

---

## 3. Estado actual exacto

### Rutas que existen en el código

- **`/api/bot`**  
  - Definida por el archivo `api/bot.js`.  
  - Solo responde si el módulo carga bien; si falla la carga (p. ej. por falta de `BOT_TOKEN`), Vercel no tiene función y devuelve 404.

### Rutas que no existen

- **`/`**  
  - No hay página de inicio ni función para la raíz → 404 esperado.

### Qué espera Vercel

- Carpeta `api/` en la raíz del proyecto.
- Archivos en `api/` con `export default function handler(req, res)` (o equivalente).
- Que el módulo se pueda cargar sin lanzar en el top-level; si lanza, la función no existe y la ruta da 404.

### Qué hace hoy el código en runtime

- Si `BOT_TOKEN` está definido en Vercel: el módulo carga, el handler existe y `/api/bot` debería responder (200, etc.).
- Si `BOT_TOKEN` no está definido: el módulo lanza al cargar, la función no se registra y `/api/bot` → 404.

---

## 4. Corrección mínima y correcta

### Estructura final correcta (ya cumplida, salvo la validación)

```
proyecto/
├── api/
│   └── bot.js          ← Único archivo que debe existir para /api/bot
├── package.json
├── vercel.json
└── ...
```

No debe usarse `src/api/bot.js`; la ruta de Vercel es `api/` en la raíz.

### Cambio mínimo en el código

- **Quitar la validación de `BOT_TOKEN` del top-level** y hacerla **dentro del handler** (o justo antes de usar el bot). Así el módulo siempre carga y la ruta `/api/bot` existe; si falta el token, se responde con 503 (o 500) y mensaje claro en lugar de 404.

Ejemplo de handler mínimo compatible con Vercel (sin `app.listen()`, con `export default`):

```javascript
// Validar BOT_TOKEN solo cuando se va a usar (dentro del handler o al crear el bot de forma lazy)
export default async function handler(req, res) {
  if (!process.env.BOT_TOKEN) {
    return res.status(503).json({
      ok: false,
      error: "BOT_TOKEN no configurado en Vercel. Configurar en Settings → Environment Variables y redesplegar.",
    });
  }
  // ... resto del handler (GET/POST, Telegraf, etc.)
}
```

En el código actual, la corrección mínima es: **eliminar el `throw` de las líneas 17–19** y **comprobar `BOT_TOKEN` al inicio del handler**, respondiendo con 503 si no está definido.

---

## 5. Compatibilidad con Telegram

- El endpoint correcto para el webhook es el que recibe los POST de Telegram: **`https://<tu-dominio>.vercel.app/api/bot`** (por ejemplo `https://telegram-bot-portones.vercel.app/api/bot`).
- Es compatible con `setWebhook`:
  - `https://api.telegram.org/bot<TOKEN>/setWebhook`
  - Body: `{"url": "https://<tu-dominio>.vercel.app/api/bot"}`

Con la corrección anterior, ese endpoint existirá siempre (200 para GET simple, 200 para POST de Telegram cuando el token esté configurado, 503 si falta el token).

---

## 6. Cierre técnico

| Pregunta | Respuesta |
|----------|-----------|
| **Qué estaba mal** | La validación `if (!process.env.BOT_TOKEN) throw new Error(...)` en el top-level de `api/bot.js` hacía que el módulo fallara al cargar cuando `BOT_TOKEN` no estaba en Vercel, por lo que la función no se registraba y `/api/bot` devolvía 404. |
| **Qué se corrigió** | Esa validación se movió al interior del handler: si falta `BOT_TOKEN`, se responde 503 con mensaje claro y no se lanza en carga del módulo. Así la ruta `/api/bot` siempre existe. |
| **Qué endpoint debe responder 200** | `GET /api/bot` y `POST /api/bot` (cuando Telegram envía updates y `BOT_TOKEN` está configurado). Con token faltante, `GET/POST /api/bot` pueden responder 503 hasta configurar la variable y redesplegar. |
| **Qué probar después del fix** | 1) Desplegar de nuevo. 2) `GET https://<tu-dominio>.vercel.app/api/bot` → debe devolver 200 (o 503 con mensaje si falta token). 3) Configurar `BOT_TOKEN` en Vercel y redesplegar. 4) Volver a probar `GET /api/bot` (200). 5) Configurar webhook con `setWebhook` a esa URL. 6) Enviar `/start` al bot y revisar logs en Vercel. |
