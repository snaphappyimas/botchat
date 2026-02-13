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

/* ================= CONFIG ================= */

const SESSION_PATH = '/app/sessao_chikbijuWhatsAp1';
const UMA_HORA = 60 * 60 * 1000;

let pairingRequested = false;

const historico = {};
const atendimentoHumano = {};

/* ================= PASTA ================= */

if (!fs.existsSync(SESSION_PATH)) {
  fs.mkdirSync(SESSION_PATH, { recursive: true });
}

/* ================= GROQ ================= */

const groq = new OpenAI({
  apiKey: (process.env.GROQ_API_KEY || "").replace(/['"]+/g, '').trim(),
  baseURL: 'https://api.groq.com/openai/v1'
});

/* ================= PROMPT ================= */

const SYSTEM_PROMPT = `
VOCÊ É UM SISTEMA DE ATENDIMENTO COMERCIAL.
NÃO IMAGINE, NÃO CRIE, NÃO IMPROVISE.

OBEDEÇA TODAS AS REGRAS ABAIXO.

É PROIBIDO:
amor, querida, flor, linda, anjo, paixão, vida, coração.

Se usar, a resposta estará errada.
 

DIRETRIZES:
1. Nunca use termos íntimos.
2. Nunca invente informações.
3. Não calcule frete nem prazo.
4. Seja direta e profissional.

Você é a assistente da Chik Biju.

IMPORTANTE:
O MENU inicial é enviado PELO SISTEMA.
NUNCA recrie menu.

REGRAS DE NEGÓCIO:

- SE ESCOLHER 1 (CATÁLOGOS):
Envie TODOS os links e depois pergunte:

"Você gostou do catálogo?
1- Sim
2- Não
3- Menu"

[LISTA DE CATÁLOGOS]
01- https://photos.app.goo.gl/xhNzkFJZZzubRC7s9
02- https://photos.app.goo.gl/JXEUe6Xiw29bVT3y7
03- https://photos.app.goo.gl/ttpcch49bZmJxMNb9
04- https://photos.app.goo.gl/BrVwqCeSmhb8pjsbA
05- https://photos.app.goo.gl/GoirJbATzXRhWU779
06- https://photos.app.goo.gl/pXuHZBRhvXmnWD3HA
07- https://photos.app.goo.gl/g5pjEgGVb4fS1gWn6
08- https://photos.app.goo.gl/PWbgfRQKGvQfudhN6
09- https://photos.app.goo.gl/iVEBpoTzQ4TWquX18
10- https://photos.app.goo.gl/XfkUKnU6dwzuPF6E9
11- https://photos.app.goo.gl/CHRuv4Bm1gCqaN9j7
12- https://photos.app.goo.gl/kWDbXopuxxy7Gjba8
13- https://photos.app.goo.gl/gphv98Qg1w7d6epM7
14- https://photos.app.goo.gl/PBssLiufWPEmTMqs6
15- https://photos.app.goo.gl/aqp7zFiBptNRerRd7
16- https://photos.app.goo.gl/BYsLEe7NyJiDKyNq6
17- https://photos.app.goo.gl/BEBXddyuKCGfy3fp6
18- https://photos.app.goo.gl/NU8nX2N4ZTf2EcZx6
19- https://photos.app.goo.gl/CXCDtoG8JeJYgjbQ7
20- https://photos.app.goo.gl/yDYrx1a6kLE3Sbys8
21- https://photos.app.goo.gl/4xHJBhzQ4C3uWdQL9

- APÓS "1- SIM":
Peça dados de envio.

- ÔNIBUS:
Nome, Cidade, Placa, Guia, Empresa, Horário.

- CORREIO/TRANSP:
Nome/Empresa, CPF/CNPJ, Endereço, CEP, Cidade/Estado.

- SOMENTE após dados completos:
Envie PIX: 37431974000130
Sinal: R$100,00

- Se faltar dado:
Informe exatamente o que falta.

- "3" ou "MENU":
Interrompa e volte ao menu.

- SE ESCOLHER 2:
Atendimento humano.

- SE ESCOLHER 3:
Rastreio.

- SE ESCOLHER 4:
Nota fiscal.

- SE ESCOLHER 5:
Enviar PIX.

COBRANÇA:
"Oi, tudo bem? Vi que você ainda não fez o pagamento..."
`;


/* ================= LIMPAR TEXTO ================= */

function limparResposta(texto) {

  const proibidas = [
    'meu amor',
    'amor',
    'querida',
    'flor',
    'linda',
    'anjo',
    'paixão',
    'vida',
    'coração'
  ];

  let t = texto;

  proibidas.forEach(p => {
    const r = new RegExp(p, 'gi');
    t = t.replace(r, '');
  });

  return t.trim();
}

/* ================= BOT ================= */

async function iniciarBot() {

  const { state, saveCreds } =
    await useMultiFileAuthState(SESSION_PATH);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '22.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  /* ================= CONEXÃO ================= */

  sock.ev.on('connection.update', async (update) => {

    const { connection, lastDisconnect } = update;

    if (connection === 'close') {

      const reason =
        new Boom(lastDisconnect?.error)?.output?.statusCode;

      if (reason !== DisconnectReason.loggedOut) {
        setTimeout(iniciarBot, 5000);
      }
    }

    if (connection === 'open') {
      console.log('🤖 BOT ONLINE');
      pairingRequested = false;
    }

    /* ========== PAREAMENTO ========== */

    if (!state.creds.registered && !pairingRequested) {

      pairingRequested = true;

      const num = process.env.PHONE_NUMBER;
      if (!num) return;

      setTimeout(async () => {

        try {

          const code =
            await sock.requestPairingCode(num);

          console.log('👉 CÓDIGO:', code);

        } catch {
          pairingRequested = false;
        }

      }, 10000);
    }

  });

  /* ================= MENSAGENS ================= */

  sock.ev.on('messages.upsert', async ({ messages }) => {

    const msg = messages[0];
    if (!msg?.message) return;

    const jid = msg.key.remoteJid;

    if (
      jid.includes('@g.us') ||
      jid === 'status@broadcast'
    ) return;

    const agora = Date.now();

    /* ===== TEXTO ===== */

    const texto =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      '';

    if (!texto.trim()) return;

    /* ===== RESET MENU ===== */

    if (
      texto.trim() === '3' ||
      texto.toLowerCase().includes('menu')
    ) {
      delete historico[jid];
    }

    /* ===== ATENDIMENTO HUMANO ===== */

    if (texto.trim() === '2') {

      atendimentoHumano[jid] = agora;

      await sock.sendMessage(jid, {
        text: 'Aguarde um momento. Você será atendida por nossa equipe.'
      });

      return;
    }

    /* ===== MENSAGEM DO OPERADOR ===== */

    if (msg.key.fromMe) {

      atendimentoHumano[jid] = agora;
      return;
    }

    /* ===== VERIFICA PAUSA ===== */

    if (
      atendimentoHumano[jid] &&
      (agora - atendimentoHumano[jid] < UMA_HORA)
    ) {
      return;
    }

    /* ===== PRIMEIRO CONTATO ===== */

    if (!historico[jid] || historico[jid].length === 0) {

      const menu = `
🌸 Bem-vinda à Chik Biju 🌸

1 - Catálogos
2 - Atendimento humano
3 - Menu
4 - Nota fiscal
5 - Pagamento
`;

      await sock.sendMessage(jid, { text: menu });

      historico[jid] = [
        { role: 'assistant', content: menu }
      ];

      return;
    }

    /* ===== HISTÓRICO ===== */

    if (!historico[jid]) historico[jid] = [];

    historico[jid].push({
      role: 'user',
      content: texto
    });

    /* ===== IA ===== */

    try {

      const res =
        await groq.chat.completions.create({

          model: 'llama-3.3-70b-versatile',

          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...historico[jid].slice(-4)
          ],

          temperature: 0
        });

      let resposta =
        res.choices[0]?.message?.content;

      if (!resposta) return;

      // LIMPA PALAVRAS PROIBIDAS
      resposta = limparResposta(resposta);

      await sock.sendMessage(jid, {
        text: resposta
      });

      historico[jid].push({
        role: 'assistant',
        content: resposta
      });

    } catch (err) {

      console.error('❌ ERRO IA:', err.message);
    }

  });

}

iniciarBot();

