require('dotenv').config()
const { Telegraf } = require('telegraf')
const http = require('http')

const BOT_TOKEN = process.env.BOT_TOKEN
const WEBHOOK_URL = process.env.WEBHOOK_URL // Ejemplo: https://tudominio.com/webhook
const PORT = process.env.PORT || 3000

if (!BOT_TOKEN) {
  console.error('Error: BOT_TOKEN no está definido en el archivo .env')
  console.error('Asegúrate de que el archivo .env existe y contiene: BOT_TOKEN=tu_token')
  process.exit(1)
}

console.log('Iniciando bot de Telegram con webhook...')
console.log('Token encontrado:', BOT_TOKEN ? `${BOT_TOKEN.substring(0, 10)}...` : 'NO ENCONTRADO')

const bot = new Telegraf(BOT_TOKEN)

// Manejo de errores del bot
bot.catch((err, ctx) => {
  console.error('Error en el bot:', err)
})

// Función de inicio: muestra menú de botones
bot.start((ctx) => {
  ctx.reply('Seleccioná un portón:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Portón 1', callback_data: 'abrir_porton_1' }],
        [{ text: 'Portón 2', callback_data: 'abrir_porton_2' }],
      ],
    },
  })
})

// Manejo de selección de botones
bot.on('callback_query', (ctx) => {
  const data = ctx.callbackQuery.data

  if (data === 'abrir_porton_1') {
    ctx.answerCbQuery('Intención registrada: Portón 1')
    ctx.reply('Has seleccionado Portón 1')
  } else if (data === 'abrir_porton_2') {
    ctx.answerCbQuery('Intención registrada: Portón 2')
    ctx.reply('Has seleccionado Portón 2')
  } else {
    ctx.answerCbQuery('Opción no reconocida')
  }
})

// Función principal async
async function iniciarBot() {
  try {
    console.log('Verificando conexión con Telegram...')
    
    // Verificar que el bot puede conectarse
    const me = await bot.telegram.getMe()
    console.log('✅ Bot verificado:', me.username)
    
    if (WEBHOOK_URL) {
      // Modo webhook - requiere una URL pública
      console.log('Configurando webhook en:', WEBHOOK_URL)
      
      // Configurar el webhook en Telegram
      await bot.telegram.setWebhook(`${WEBHOOK_URL}/webhook`)
      
      // Crear servidor HTTP para recibir las actualizaciones
      const server = http.createServer((req, res) => {
        if (req.url === '/webhook' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => {
            body += chunk.toString()
          })
          req.on('end', () => {
            try {
              const update = JSON.parse(body)
              bot.handleUpdate(update)
            } catch (err) {
              console.error('Error procesando update:', err)
            }
            res.writeHead(200)
            res.end('OK')
          })
        } else {
          res.writeHead(404)
          res.end('Not found')
        }
      })
      
      server.listen(PORT, () => {
        console.log(`✅ Servidor webhook escuchando en puerto ${PORT}`)
        console.log(`✅ Webhook configurado en: ${WEBHOOK_URL}/webhook`)
        console.log('Presiona Ctrl+C para detener el bot')
      })
      
    } else {
      // Modo polling (fallback si no hay WEBHOOK_URL)
      // NOTA: En Vercel no se usa polling, se usa el archivo api/bot.js
      console.log('⚠️  WEBHOOK_URL no configurado, usando polling...')
      console.log('Para usar webhook, agrega WEBHOOK_URL=https://tudominio.com al archivo .env')
      console.log('Para Vercel, usa el archivo api/bot.js en lugar de este')
      
      // bot.launch() comentado - en Vercel se usa api/bot.js
      // bot.launch({
      //   polling: {
      //     timeout: 10,
      //     limit: 100
      //   }
      // })
      
      // await new Promise(resolve => setTimeout(resolve, 1000))
      // console.log('✅ Bot iniciado correctamente y escuchando mensajes...')
      // console.log('Presiona Ctrl+C para detener el bot')
      console.log('⚠️  Polling deshabilitado. Usa api/bot.js para Vercel o configura WEBHOOK_URL')
    }
    
  } catch (err) {
    console.error('❌ Error al iniciar el bot:')
    console.error('Mensaje:', err.message)
    if (err.response) {
      console.error('Respuesta de Telegram:', JSON.stringify(err.response, null, 2))
    }
    if (err.description) {
      console.error('Descripción:', err.description)
    }
    process.exit(1)
  }
}

// Iniciar el bot
iniciarBot()

// Cierre limpio del proceso
process.once('SIGINT', () => {
  console.log('\nDeteniendo bot...')
  bot.stop('SIGINT')
  process.exit(0)
})
process.once('SIGTERM', () => {
  console.log('\nDeteniendo bot...')
  bot.stop('SIGTERM')
  process.exit(0)
})