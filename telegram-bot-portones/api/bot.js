const { Telegraf } = require('telegraf')
require('dotenv').config()

const bot = new Telegraf(process.env.BOT_TOKEN)

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

// Exportamos handler para Vercel
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body, res)
      res.status(200).send('OK')
    } else {
      res.status(200).send('Bot de portones activo.')
    }
  } catch (error) {
    console.error(error)
    res.status(500).send('Error en bot')
  }
}

