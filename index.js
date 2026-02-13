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
const SESSION_PATH = '/app/sessao_chikbijuWhatsAppp1';
const UMA_HORA = 60 * 60 * 1000;
let pairingRequested = false;

/* ================= VARIÁVEIS ================= */
const historico = {};
const estado = {}; 
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
01- BRINCOS DOURADOS E PRATAS: https://photos.app.goo.gl/xhNzkFJZZzubRC7s9
02- BRINCOS FOSCOS E 2 BANHOS: https://photos.app.goo.gl/JXEUe6Xiw29bVT3y7
03- BRINCOS DE FESTAS E PEDRARIAS: https://photos.app.goo.gl/ttpcch49bZmJxMNb9
04- BRINCOS RÚSTICOS E PÉROLAS: https://photos.app.goo.gl/BrVwqCeSmhb8pjsbA
05- BRINCOS RESINADOS: https://photos.app.goo.gl/GoirJbATzXRhWU779
06- BRINCOS DE VERÃO E PALHA: https://photos.app.goo.gl/pXuHZBRhvXmnWD3HA
07- KITS BRINCOS E PIERCING FAKE: https://photos.app.goo.gl/g5pjEgGVb4fS1gWn6
08- BRACELETES: https://photos.app.goo.gl/PWbgfRQKGvQfudhN6
09- PULSEIRAS E TORNOZELEIRAS: https://photos.app.goo.gl/iVEBpoTzQ4TWquX18
10- ACESSÓRIOS DE CABELO: https://photos.app.goo.gl/XfkUKnU6dwzuPF6E9
11- ACESSÓRIOS INFANTIS: https://photos.app.goo.gl/CHRuv4Bm1gCqaN9j7
12- COLARES FOLHEADOS E DELICADOS: https://photos.app.goo.gl/kWDbXopuxxy7Gjba8
13- COLARES CORRENTARIAS: https://photos.app.goo.gl/gphv98Qg1w7d6epM7
14- COLARES DE PÉROLAS E TRANSPARENTES: https://photos.app.goo.gl/PBssLiufWPEmTMqs6
15- COLARES RÚSTICOS E BOHOCHIC: https://photos.app.goo.gl/aqp7zFiBptNRerRd7
16- CHOKES E AROS: https://photos.app.goo.gl/BYsLEe7NyJiDKyNq6
17- ANÉIS: https://photos.app.goo.gl/BEBXddyuKCGfy3fp6
18- CINTOS: https://photos.app.goo.gl/NU8nX2N4ZTf2EcZx6
19- LENÇOS E CANGAS: https://photos.app.goo.gl/CXCDtoG8JeJYgjbQ7
20- BOLSAS E CHAPÉUS: https://photos.app.goo.gl/yDYrx1a6kLE3Sbys8
21- COLARES DE VERÃO: https://photos.app.goo.gl/4xHJBhzQ4C3uWdQL9
`;

/* ================= FUNÇÕES AUXILIARES ================= */
async function enviarMenu(sock, jid) {
  const menu = `🌸 Bem-vinda à Chik Biju 🌸\n\n1 - Catálogos\n2 - Atendimento humano\n3 - Rastrear meu pedido\n4 - Nota fiscal\n5 - Pagamento\n\nEscolha uma opção:`;
  await sock.sendMessage(jid, { text: menu });
}

async function liberarPix(sock, jid) {
  await sock.sendMessage(jid, {
    text: `Dados recebidos.\n\nPIX: 37431974000130\nSinal: R$ 100,00\n\nAgora envie seu pedido.`
  });
}

function validarOnibus(texto) {
  return texto.includes('\n') || texto.split(',').length >= 5;
}

function validarCorreio(texto) {
  return texto.toLowerCase().includes('cep') && texto.match(/\d{5}-?\d{3}/);
}

function limparResposta(texto) {
  return texto.replace(/\n{2,}/g, '\n').trim();
}

/* ================= BOT ================= */
async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '22.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  /* ========== CONEXÃO (AQUI FOI A CORREÇÃO) ========== */
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log('✅ BOT CHIK BIJU ONLINE');
      pairingRequested = false;
    }

    if (connection === 'close') {
      console.log('❌ BOT DESCONECTADO');
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        setTimeout(() => iniciarBot(), 5000);
      }
    }

    // LOGICA DE PAREAMENTO ADICIONADA
    if (!state.creds.registered && !pairingRequested) {
      pairingRequested = true;
      const num = process.env.PHONE_NUMBER;
      
      if (!num) {
        console.log("❌ ERRO: PHONE_NUMBER não definido nas variáveis!");
        return;
      }

      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(num);
          console.log(`👉 SEU CÓDIGO DE PAREAMENTO: ${code}`);
        } catch (err) {
          console.error("❌ Erro ao pedir código:", err);
          pairingRequested = false;
        }
      }, 10000);
    }
  });

  /* ========== MENSAGENS ========== */
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    if (jid.includes('@g.us') || jid === 'status@broadcast') return;

    const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';
    if (!texto.trim()) return;

    const msgUser = texto.trim().toLowerCase();

    // RESET
    if (msgUser === 'menu' || msgUser === '0') {
      delete historico[jid];
      delete estado[jid];
      delete atendimentoHumano[jid];
      await enviarMenu(sock, jid);
      return;
    }

    // PRIMEIRO CONTATO
    if (!estado[jid]) {
      historico[jid] = [];
      estado[jid] = 'menu';
      await enviarMenu(sock, jid);
      return;
    }

    // ATENDIMENTO HUMANO
    if (estado[jid] === 'humano') {
      const tempo = Date.now() - (atendimentoHumano[jid] || 0);
      if (tempo < UMA_HORA) return;
      delete atendimentoHumano[jid];
      estado[jid] = 'menu';
      await enviarMenu(sock, jid);
      return;
    }

    /* ================= FLUXO DE ESTADOS ================= */
    switch (estado[jid]) {
      case 'menu':
        if (msgUser === '1') {
          estado[jid] = 'catalogo';
          await sock.sendMessage(jid, { text: 'Aguarde, enviando catálogos...' });
          // Aqui você enviaria os links e perguntaria 1-Sim, 2-Não
        } else if (msgUser === '2') {
          estado[jid] = 'humano';
          atendimentoHumano[jid] = Date.now();
          await sock.sendMessage(jid, { text: 'Você será atendida por nossa equipe.' });
        } else if (msgUser === '3') {
          estado[jid] = 'rastreio';
          await sock.sendMessage(jid, { text: 'Informe o número do pedido.' });
        } else if (msgUser === '4') {
          estado[jid] = 'nota';
          await sock.sendMessage(jid, { text: 'Informe CPF ou CNPJ.' });
        } else if (msgUser === '5') {
          await sock.sendMessage(jid, { text: `PIX: 37431974000130\nSinal: R$100,00` });
        } else {
          await sock.sendMessage(jid, { text: 'Escolha uma opção válida.' });
        }
        return;

      case 'catalogo':
        estado[jid] = 'escolha_envio';
        await sock.sendMessage(jid, { text: `Você gostou do catálogo?\n1 - Sim\n2 - Não\n3 - Menu` });
        return;

      case 'escolha_envio':
        if (msgUser === '1') {
          estado[jid] = 'dados_onibus';
          await sock.sendMessage(jid, { text: `Informe:\nNome\nCidade\nPlaca\nGuia\nEmpresa\nHorário` });
        } else if (msgUser === '2') {
          estado[jid] = 'dados_correio';
          await sock.sendMessage(jid, { text: `Informe:\nNome / Empresa\nCPF ou CNPJ\nEndereço\nCEP\nCidade / Estado` });
        } else if (msgUser === '3') {
          estado[jid] = 'menu';
          await enviarMenu(sock, jid);
        }
        return;

      case 'dados_onibus':
        if (!validarOnibus(texto)) {
          await sock.sendMessage(jid, { text: 'Faltam dados. Envie tudo.' });
          return;
        }
        await liberarPix(sock, jid);
        estado[jid] = 'pedido';
        return;

      case 'dados_correio':
        if (!validarCorreio(texto)) {
          await sock.sendMessage(jid, { text: 'Dados incompletos.' });
          return;
        }
        await liberarPix(sock, jid);
        estado[jid] = 'pedido';
        return;
      // ... adicione os outros cases conforme necessário
    }

    /* ================= FALLBACK IA ================= */
    if (!historico[jid]) historico[jid] = [];
    historico[jid].push({ role: 'user', content: texto });

    try {
      const res = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...historico[jid].slice(-4)],
        temperature: 0
      });

      let resposta = res.choices[0]?.message?.content;
      if (!resposta) return;
      resposta = limparResposta(resposta);
      await sock.sendMessage(jid, { text: resposta });
      historico[jid].push({ role: 'assistant', content: resposta });
    } catch (err) {
      console.error('ERRO IA:', err.message);
    }
  });
}

iniciarBot();
