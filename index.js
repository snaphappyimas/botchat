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
const historico = {};
const atendimentoHumano = {};

if (!fs.existsSync(SESSION_PATH)) {
  fs.mkdirSync(SESSION_PATH, { recursive: true });
}

const groq = new OpenAI({
  apiKey: (process.env.GROQ_API_KEY || "").replace(/['"]+/g, '').trim(),
  baseURL: 'https://api.groq.com/openai/v1'
});

/* ================= PROMPT COMPLETO (REGRAS DE OURO) ================= */
const SYSTEM_PROMPT = `
VOCÊ É A ASSISTENTE VIRTUAL DA CHIK BIJU. FOCO EM VENDAS DE JOIAS.
SEJA EXTREMAMENTE HUMANA, PACIENTE E EMPÁTICA.

DIRETRIZES DE PERSONALIDADE:
- NUNCA trate o cliente de forma ríspida.
- NUNCA encerre sem perguntar se pode ajudar em algo mais.
- PROIBIDO: amor, querida, flor, linda, anjo, paixão, vida, coração. Use "Empreendedora".

REGRAS DE NEGÓCIO:
1. SE ESCOLHER 1 (CATÁLOGOS): Envie os 21 links abaixo e pergunte: "Você gostou? 1-Sim, 2-Não ou 3-Menu".
[LINKS]
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

2. SE ESCOLHER "1-SIM" (PEDIDO): Pergunte a forma de envio (Ônibus, Correio, etc).
3. COLETA DE DADOS: Só libere o PIX 37431974000130 após receber TODOS os dados.
- ÔNIBUS: Nome, Cidade, Placa, Guia, Empresa, Horário.
- CORREIO: Nome, CPF/CNPJ, Endereço, CEP, Cidade/Estado.
4. SE ESCOLHER 2: Diga "Meu nome é Cici, vou continuar seu atendimento".
`;

/* ================= FUNÇÕES AUXILIARES ================= */
async function enviarMenu(sock, jid) {
  const menu = `🌸 Bem-vinda à Chik Biju 🌸\n\n1 - Catálogos\n2 - Continuar atendimento\n3 - Rastrear meu pedido\n4 - Nota fiscal\n5 - Pagamento\n\nEscolha uma opção:`;
  await sock.sendMessage(jid, { text: menu });
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

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') console.log('✅ BOT ONLINE');
    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) setTimeout(iniciarBot, 5000);
    }
    
    // GERAÇÃO DO CÓDIGO DE PAREAMENTO
    if (!state.creds.registered && !pairingRequested) {
        pairingRequested = true;
        const num = process.env.PHONE_NUMBER;
        if (num) {
            setTimeout(async () => {
                const code = await sock.requestPairingCode(num);
                console.log(`👉 SEU CÓDIGO: ${code}`);
            }, 10000);
        }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message) return;
    const jid = msg.key.remoteJid;
    if (jid.includes('@g.us') || jid === 'status@broadcast') return;

    // 1. LÓGICA DE PAUSA (Se VOCÊ responder no WhatsApp, o bot para por 1h)
    if (msg.key.fromMe) {
      atendimentoHumano[jid] = Date.now();
      return;
    }
    if (atendimentoHumano[jid] && (Date.now() - atendimentoHumano[jid] < UMA_HORA)) return;

    const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    if (!texto.trim()) return;

    // 2. LÓGICA DE IA (Substituindo o Switch Case falho)
    if (!historico[jid]) {
      historico[jid] = [];
      await enviarMenu(sock, jid);
      return;
    }

    historico[jid].push({ role: 'user', content: texto });

    try {
      const res = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...historico[jid].slice(-6)],
        temperature: 0.5
      });

      const resposta = res.choices[0]?.message?.content;
      if (resposta) {
        await sock.sendMessage(jid, { text: resposta });
        historico[jid].push({ role: 'assistant', content: resposta });
      }
    } catch (err) {
      console.error('ERRO IA:', err.message);
    }
  });
}

iniciarBot();
