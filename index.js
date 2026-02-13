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

const SESSION_PATH = '/app/sessao_chikbijuWhatsApp1';
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
/* ================= CONTROLE ================= */

const historico = {};
const estado = {}; 
// menu | catalogo | escolha_envio | dados_onibus | dados_correio | pedido | finalizado | humano | rastreio | nota

const atendimentoHumano = {};
const UMA_HORA = 60 * 60 * 1000;


/* ================= MENU ================= */

async function enviarMenu(sock, jid) {

  const menu = `
🌸 Bem-vinda à Chik Biju 🌸

1 - Catálogos
2 - Atendimento humano
3 - Rastrear meu pedido
4 - Nota fiscal
5 - Pagamento

Escolha uma opção:
`;

  await sock.sendMessage(jid, { text: menu });
}


/* ================= PIX ================= */

async function liberarPix(sock, jid) {

  await sock.sendMessage(jid, {
    text: `Dados recebidos.

PIX: 37431974000130
Sinal: R$ 100,00

Agora envie seu pedido.`
  });
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


  /* ================= ONLINE ================= */

  sock.ev.on('connection.update', (update) => {

    const { connection } = update;

    if (connection === 'open') {
      console.log('✅ BOT CHIK BIJU ONLINE');
    }

    if (connection === 'close') {
      console.log('❌ BOT DESCONECTADO');
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


    const texto =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      '';

    if (!texto.trim()) return;

    const msgUser = texto.trim().toLowerCase();



    /* ================= RESET ================= */

    if (msgUser === 'menu' || msgUser === '0') {

      delete historico[jid];
      delete estado[jid];
      delete atendimentoHumano[jid];

      await enviarMenu(sock, jid);
      return;
    }



    /* ================= PRIMEIRO CONTATO ================= */

    if (!historico[jid]) {

      historico[jid] = [];
      estado[jid] = 'menu';

      await enviarMenu(sock, jid);
      return;
    }



    /* ================= HUMANO ================= */

    if (estado[jid] === 'humano') {

      const tempo =
        Date.now() - (atendimentoHumano[jid] || 0);

      if (tempo < UMA_HORA) return;

      delete atendimentoHumano[jid];

      estado[jid] = 'menu';

      await enviarMenu(sock, jid);
      return;
    }



    /* ==================================================
       MENU
    ================================================== */

    if (estado[jid] === 'menu') {

      if (msgUser === '1') {

        estado[jid] = 'catalogo';

        await sock.sendMessage(jid, {
          text: 'Aguarde, enviando catálogos...'
        });

        return;
      }


      if (msgUser === '2') {

        estado[jid] = 'humano';

        atendimentoHumano[jid] = Date.now();

        await sock.sendMessage(jid, {
          text: 'Você será atendida por nossa equipe.'
        });

        return;
      }


      if (msgUser === '3') {

        estado[jid] = 'rastreio';

        await sock.sendMessage(jid, {
          text: 'Informe o número do pedido.'
        });

        return;
      }


      if (msgUser === '4') {

        estado[jid] = 'nota';

        await sock.sendMessage(jid, {
          text: 'Informe CPF ou CNPJ.'
        });

        return;
      }


      if (msgUser === '5') {

        await sock.sendMessage(jid, {
          text: `PIX: 37431974000130
Sinal: R$100,00`
        });

        return;
      }


      await sock.sendMessage(jid, {
        text: 'Escolha uma opção válida.'
      });

      return;
    }



    /* ==================================================
       CATÁLOGO
    ================================================== */

    if (estado[jid] === 'catalogo') {

      estado[jid] = 'escolha_envio';

      await sock.sendMessage(jid, {
        text: `Você gostou do catálogo?

1 - Sim
2 - Não
3 - Menu`
      });

      return;
    }



    /* ==================================================
       ESCOLHA ENVIO
    ================================================== */

    if (estado[jid] === 'escolha_envio') {

      if (msgUser === '1') {

        estado[jid] = 'dados_onibus';

        await sock.sendMessage(jid, {
          text: `Informe:

Nome
Cidade
Placa
Guia
Empresa
Horário`
        });

        return;
      }


      if (msgUser === '2' || msgUser === '3') {

        estado[jid] = 'dados_correio';

        await sock.sendMessage(jid, {
          text: `Informe:

Nome / Empresa
CPF ou CNPJ
Endereço
CEP
Cidade / Estado`
        });

        return;
      }


      if (msgUser === '3') {

        estado[jid] = 'menu';

        await enviarMenu(sock, jid);
        return;
      }

      return;
    }



    /* ==================================================
       DADOS ÔNIBUS
    ================================================== */

    if (estado[jid] === 'dados_onibus') {

      if (!validarOnibus(texto)) {

        await sock.sendMessage(jid, {
          text: 'Faltam dados. Envie tudo.'
        });

        return;
      }

      await liberarPix(sock, jid);

      estado[jid] = 'pedido';
      return;
    }



    /* ==================================================
       DADOS CORREIO
    ================================================== */

    if (estado[jid] === 'dados_correio') {

      if (!validarCorreio(texto)) {

        await sock.sendMessage(jid, {
          text: 'Dados incompletos.'
        });

        return;
      }

      await liberarPix(sock, jid);

      estado[jid] = 'pedido';
      return;
    }



    /* ==================================================
       PEDIDO
    ================================================== */

    if (estado[jid] === 'pedido') {

      estado[jid] = 'finalizado';

      await sock.sendMessage(jid, {
        text: 'Pedido registrado. Em breve confirmamos.'
      });

      return;
    }



    /* ==================================================
       RASTREIO
    ================================================== */

    if (estado[jid] === 'rastreio') {

      await sock.sendMessage(jid, {
        text: 'Vamos verificar seu pedido.'
      });

      estado[jid] = 'menu';
      return;
    }



    /* ==================================================
       NOTA
    ================================================== */

    if (estado[jid] === 'nota') {

      await sock.sendMessage(jid, {
        text: 'Nota em processamento.'
      });

      estado[jid] = 'menu';
      return;
    }



    /* ==================================================
       IA (FALLBACK)
    ================================================== */

    historico[jid].push({
      role: 'user',
      content: texto
    });


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


      resposta = limparResposta(resposta);


      await sock.sendMessage(jid, {
        text: resposta
      });


      historico[jid].push({
        role: 'assistant',
        content: resposta
      });


    } catch (err) {

      console.error('ERRO IA:', err.message);
    }

  });

}


/* ================= VALIDAÇÕES ================= */

function validarOnibus(texto) {

  return (
    texto.includes('\n') ||
    texto.split(',').length >= 5
  );
}


function validarCorreio(texto) {

  return (
    texto.toLowerCase().includes('cep') &&
    texto.match(/\d{5}-?\d{3}/)
  );
}


/* ================= START ================= */

iniciarBot();
