require('dotenv').config();
const fs = require('fs');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');

const { Boom } = require('@hapi/boom');
const pino = require('pino');
const OpenAI = require('openai');


// CONFIGURAÇÕES

const SESSION_PATH = '/app/sessao_groq';

// garante pasta de sessão
if (!fs.existsSync(SESSION_PATH)) {
  fs.mkdirSync(SESSION_PATH, { recursive: true });
}

// GROQ
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1'
});

// histórico simples
const historico = {};

const PROMPT_BASE = `
Você é um assistente virtual amigável e profissional.
Responda sempre em português do Brasil.
Cumprimente conforme o horário (bom dia, boa tarde ou boa noite).
Seja educado, claro e objetivo.
`;

// ===============================
async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Ubuntu', 'Chrome', '22.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;

      if (reason !== DisconnectReason.loggedOut) {
        console.log('🔄 Reconectando em 5s...');
        setTimeout(() => iniciarBot(), 5000);
      }
    }

    if (connection === 'open') {
      console.log('🤖 BOT ONLINE COM GROQ');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    const texto =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text;

    if (!texto) return;

    console.log(`📩 ${jid}: ${texto}`);

    if (!historico[jid]) historico[jid] = [];
    historico[jid].push({ role: 'user', content: texto });

    if (historico[jid].length > 6) historico[jid].shift();

    try {
      const resposta = await groq.chat.completions.create({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: PROMPT_BASE },
          ...historico[jid]
        ],
        max_tokens: 300,
        temperature: 0.6
      });

      const textoResposta = resposta.choices[0].message.content;

      await sock.sendMessage(jid, { text: textoResposta });
      historico[jid].push({ role: 'assistant', content: textoResposta });

      console.log('✅ Resposta enviada');

    } catch (err) {
      console.error('❌ Erro IA:', err.message);
      await sock.sendMessage(jid, {
        text: 'Tive uma instabilidade agora, pode repetir por favor?'
      });
    }
  });
}

iniciarBot();
