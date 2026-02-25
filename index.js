console.log("🚀 O BOT ESTÁ TENTANDO INICIAR AGORA..."); // ADICIONE ISSO NA LINHA 1
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

const SESSION_PATH = '/app/sessao_nova_conexaochattbot';
const UMA_HORA = 60 * 60 * 1000;

const PALAVRA_PAUSA = "#pausar";
const PALAVRA_VOLTAR = "#voltar";

let pairingRequested = false;

if (!fs.existsSync(SESSION_PATH)) {
  fs.mkdirSync(SESSION_PATH, { recursive: true });
}

const groq = new OpenAI({
  apiKey: (process.env.GROQ_API_KEY || "").replace(/['"]+/g, '').trim(),
  baseURL: 'https://api.groq.com/openai/v1'
});

const historico = {};
const atendimentoHumano = {};

const SYSTEM_PROMPT = `
Você é a assistente virtual da Chik Biju. Seu atendimento é focado em vendas de joias para empreendedoras, sendo extremamente humana, paciente, empática e educada. 

DIRETRIZES DE PERSONALIDADE:
- NUNCA trate o cliente de forma ríspida ou curta.
- NUNCA encerre o atendimento sem perguntar se pode ajudar em algo mais.
- PROIBIDO: amor, querida, flor, linda, anjo, paixão, vida, coração. Use "Empreendedora".

MENU PRINCIPAL:
Seja bem vindo Chik Biju!
1 - Catálogos
2 - Continuar atendimento
3 - Rastrear meu pedido
4 - Nota fiscal
5 - Realizar pagamento

REGRAS DE NEGÓCIO:
- SE ESCOLHER 1 (CATÁLOGOS): Envie os 21 links e pergunte se gostou.
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

- SE ESCOLHER 1 (SIM PARA PEDIDO): Diga: "Para facilitar seu atendimento, por favor me envie as informações completas abaixo". Em seguida, pergunte a forma de envio:
1-Ônibus,
2-Correios
3-Transportadora
4-Outra.
- DADOS ÔNIBUS: Peça Nome, Cidade, Placa, Guia, Empresa e Horário.Regra não siga pra o proximo passo se o cliente não preencher tudo
- DADOS CORREIO/TRANSP: Peça Nome/Empresa, CPF/CNPJ, Endereço completo, CEP, Cidade/Estado.Regra não siga pra o proximo passo se o cliente não preencher tudo
- APÓS DADOS ENVIADOS: Envie o PIX 37431974000130 e diga: "Para iniciar seu pedido é necessário um sinal no valor de 100,00 reais que é abatido no final da compra. Agora já tenho seus dados, pode enviar o pedido com a quantidade desejada".


- SE ESCOLHER 2: Diga que a Cici vai atender.
- COLETA DE DADOS: Só libere o PIX 37431974000130 após receber todos os dados (Nome, CPF, Endereço, etc).
- SE ESCOLHER 3 (RASTREIO): Ofereça 1-Ônibus e 2-Correio e chame a Cici.
- SE ESCOLHER 4 (NOTA FISCAL): Peça os dados fiscais e o romaneio. Depois chame a Cici.
- SE ESCOLHER 5 (PAGAMENTO): Envie o PIX 37431974000130.

REGRAS IMPORTANTES SOBRE VALORES (OBRIGATÓRIO):

- VOCÊ NUNCA pode informar valores de produtos individuais.
- VOCÊ NUNCA pode chutar, estimar ou sugerir preços.
- VOCÊ NUNCA pode repetir valores que o cliente mencionar.

SE o cliente perguntar sobre preço, valor, custo ou quanto custa:

👉 PRIMEIRA VEZ:
Responda de forma educada:
"Os valores estão disponíveis diretamente nos catálogos enviados 😊
Lá você consegue visualizar todos os modelos com seus respectivos preços."

👉 SE O CLIENTE INSISTIR NOVAMENTE:
Responda:
"Para que não ocorra nenhum erro nos valores, peço que aguarde um momento que iremos passar tudo detalhado para você."

👉 SE INSISTIR MAIS UMA VEZ:
Responda:
"Só um momento, já vou te explicar tudo certinho para evitar qualquer informação incorreta."

- Após a terceira insistência, não invente valores.
- Não entre em conflito.
- Não discuta.
- Apenas mantenha postura profissional.

REGRAS SOBRE FOTOS E IMAGENS (OBRIGATÓRIO):

- Você NUNCA deve dizer que não recebeu a foto.
- Você NUNCA deve dizer que não consegue visualizar imagens.
- Você NUNCA deve contradizer o cliente.

Se o cliente disser que enviou uma foto, ou perguntar o valor de algo que enviou em imagem:

Responda SEMPRE:

"Perfeito, Empreendedora 😊  
Aguarde só alguns minutinhos que já vou verificar e te passar tudo detalhado sobre esses valores."

- Não peça para reenviar a foto.
- Não diga que não recebeu.
- Não diga que é apenas texto.
- Apenas peça para aguardar.
- Não informe valores nesse momento.
`;

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

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        setTimeout(() => iniciarBot(), 5000);
      }
    }

    if (connection === 'open') {
      console.log('🤖 BOT CHIK BIJU ONLINE');
      pairingRequested = false;
    }

    if (!state.creds.registered && !pairingRequested) {
      pairingRequested = true;
      const num = process.env.PHONE_NUMBER;
      if (!num) return;

      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(num);
          console.log(`👉 CÓDIGO DE PAREAMENTO: ${code}`);
        } catch (err) {
          pairingRequested = false;
        }
      }, 10000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message) return;

    const msgTime = msg.messageTimestamp;
    const agora = Math.floor(Date.now() / 1000);
    if (agora - msgTime > 30) return;

    const jid = msg.key.remoteJid;

    const texto =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    /* ==============================
       🔐 CONTROLE MANUAL DE PAUSA
    ============================== */

    if (msg.key.fromMe) {
      const textoLower = texto.toLowerCase().trim();

      if (textoLower === PALAVRA_PAUSA) {
        atendimentoHumano[jid] = Date.now();
        console.log(`🛑 Bot pausado manualmente para ${jid}`);
      }

      if (textoLower === PALAVRA_VOLTAR) {
        delete atendimentoHumano[jid];
        console.log(`✅ Bot reativado manualmente para ${jid}`);
      }

      return;
    }

    /* ==============================
       ⏸️ VERIFICA SE ESTÁ EM PAUSA
    ============================== */

    if (atendimentoHumano[jid]) {
      const tempoDecorrido = Date.now() - atendimentoHumano[jid];

      if (tempoDecorrido < UMA_HORA) {
        console.log(`⏸️ Bot está pausado para ${jid}`);
        return;
      } else {
        console.log(`✅ Pausa automática encerrada para ${jid}`);
        delete atendimentoHumano[jid];
      }
    }

    if (!texto) return;

    if (!historico[jid]) historico[jid] = [];
    historico[jid].push({ role: 'user', content: texto });

    try {
      const resposta = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...historico[jid].slice(-8)
        ],
      });

      const textoFinal = resposta.choices[0].message.content;

      await sock.sendMessage(jid, { text: textoFinal });

      historico[jid].push({ role: 'assistant', content: textoFinal });

    } catch (err) {
      console.error('❌ Erro Groq:', err.message);
    }
  });
}

iniciarBot();













