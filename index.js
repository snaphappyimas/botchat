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

const SESSION_PATH = '/app/sessao_groq';
let pairingRequested = false;

if (!fs.existsSync(SESSION_PATH)) {
  fs.mkdirSync(SESSION_PATH, { recursive: true });
}

const groq = new OpenAI({
  apiKey: (process.env.GROQ_API_KEY || "").replace(/['"]+/g, '').trim(),
  baseURL: 'https://api.groq.com/openai/v1'
});

const historico = {};

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '22.0.0'],
    connectTimeoutMs: 60000, // Aumentado para evitar o 408
    keepAliveIntervalMs: 30000
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log('❌ Conexão fechada. Código:', reason);

      // Se der timeout (408) ou erro de credencial (401), tentamos de novo
      if (reason === DisconnectReason.connectionLost || reason === 408 || reason === 401) {
        console.log('🔄 Reiniciando por perda de sinal...');
        setTimeout(() => iniciarBot(), 5000);
      } else if (reason !== DisconnectReason.loggedOut) {
        setTimeout(() => iniciarBot(), 5000);
      }
    }

    if (connection === 'open') {
      console.log('🤖 BOT ONLINE COM GROQ');
      pairingRequested = false;
    }

    // Pedir código de pareamento se não estiver registrado
    if (!state.creds.registered && !pairingRequested) {
        pairingRequested = true;
        const num = process.env.PHONE_NUMBER;
        
        if (!num) {
            console.log('⚠️ Aguardando variáveis de ambiente (PHONE_NUMBER)...');
            pairingRequested = false;
            return;
        }

        setTimeout(async () => {
            try {
                console.log('📲 Solicitando código para:', num);
                const code = await sock.requestPairingCode(num);
                console.log(`👉 CÓDIGO DE PAREAMENTO: ${code}`);
            } catch (err) {
                console.error('❌ Erro ao gerar código:', err.message);
                pairingRequested = false;
            }
        }, 10000); // 10 segundos de espera para garantir conexão estável
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message || msg.key.fromMe) return;
    const jid = msg.key.remoteJid;
    const texto = msg.message.conversation || msg.message.extendedTextMessage?.text;
    if (!texto) return;

    if (!historico[jid]) historico[jid] = [];
    historico[jid].push({ role: 'user', content: texto });

    try {
      const resposta = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'system', content: 'Você é um assistente amigável.' }, ...historico[jid].slice(-6)],
      });
      await sock.sendMessage(jid, { text: resposta.choices[0].message.content });
    } catch (err) {
      console.error('❌ Erro Groq:', err.message);
    }
  });
}

iniciarBot();