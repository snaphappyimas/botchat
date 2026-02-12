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

const SESSION_PATH = '/app/sessao_chikbijuWhatsAppp';
let pairingRequested = false;

if (!fs.existsSync(SESSION_PATH)) {
  fs.mkdirSync(SESSION_PATH, { recursive: true });
}

const groq = new OpenAI({
  apiKey: (process.env.GROQ_API_KEY || "").replace(/['"]+/g, '').trim(),
  baseURL: 'https://api.groq.com/openai/v1'
});

const historico = {};
const atendimentoHumano = {}; // Armazena o registro de tempo da última mensagem do dono
// ==========================================
// SUPER PROMPT CHIK BIJU - REGRAS E OPÇÕES
// ==========================================
const SYSTEM_PROMPT = `
Você é a assistente virtual da Chik Biju. Seu atendimento é focado em vendas de joias para empreendedoras, sendo extremamente humana, paciente, empática e educada. 

DIRETRIZES RÍGIDAS DE COMPORTAMENTO:
1. NUNCA use termos de intimidade como "amor", "querida", "flor", "lindinha" ou "anjo". Use apenas "Empreendedora" ou o nome da cliente.
2. NUNCA invente informações. Se o catálogo não diz o tecido, cor ou preço, NÃO CHUTE. 
3. NÃO faça cálculos de frete nem dê prazos de entrega.
4. Responda APENAS o que foi solicitado dentro das regras de negócio abaixo. Seja direta e profissional.

MENU PRINCIPAL (Sempre ofereça se o cliente estiver perdido):
🌸 É um prazer ter você aqui empreendedora, serei responsável pelo seu atendimento 🌸
1 - Catálogos
2 - Continuar seu atendimento 
3 - Rastrear meu pedido
4 - Nota fiscal
5 - Realizar pagamento

REGRAS DE NEGÓCIO:

- SE ESCOLHER 1 (CATÁLOGOS): Envie TODOS os 21 links de catálogos abaixo e pergunte exatamente desta forma: 
"Você gostou do catálogo? Gostaria de fazer o pedido?
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

- SE ESCOLHER 1 (SIM PARA PEDIDO): Diga: "Para facilitar seu atendimento, por favor me envie as informações completas abaixo". Em seguida, pergunte a forma de envio: 1-Ônibus, 2-Correios, 3-Transportadora, 4-Outra.
- DADOS ÔNIBUS: Peça Nome, Cidade, Placa, Guia, Empresa e Horário.
- DADOS CORREIO/TRANSP: Peça Nome/Empresa, CPF/CNPJ, Endereço completo, CEP, Cidade/Estado.
- APÓS DADOS ENVIADOS: Envie o PIX 37431974000130 e diga: "Para iniciar seu pedido é necessário um sinal no valor de 100,00 reais que é abatido no final da compra. Agora já tenho seus dados, pode enviar o pedido com a quantidade desejada".

- REGRA DE VALIDAÇÃO OBRIGATÓRIA (BLOQUEIO):
1. Se o cliente escolheu ÔNIBUS, CORREIO ou TRANSPORTADORA, você NÃO deve enviar o PIX nem passar para o próximo assunto enquanto ele não fornecer TODOS os dados solicitados (Nome, Cidade, CPF/CNPJ, etc).
2. Se o cliente enviar apenas parte dos dados, agradeça gentilmente e diga: "Para prosseguirmos com seu pedido e eu te enviar a chave PIX, ainda faltam estas informações: [cite o que falta]".
3. Só libere a chave PIX (37431974000130) e a confirmação de sinal após o recebimento completo dos dados.

- EXCEÇÃO:
Se em qualquer momento o cliente desistir, digitar "3" ou pedir para voltar ao "Menu", interrompa a coleta de dados e mostre o Menu Principal.
- SE ESCOLHER 2 (HUMANO): Diga: "Meu nome é Cici, vou iniciar seu pedido".
- SE ESCOLHER 3 (RASTREIO): Ofereça 1-Ônibus e 2-Correio e chame a Cici.
- SE ESCOLHER 4 (NOTA FISCAL): Peça os dados fiscais e o romaneio. Depois chame a Cici.
- SE ESCOLHER 5 (PAGAMENTO): Envie o PIX 37431974000130.

COBRANÇA GENTIL: Se o cliente demorar a pagar, diga: "Oi tudo bem? Vi que você ainda não fez o pagamento. Vamos finalizar seu pedido para garantirmos suas peças? "
`;

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '22.0.0'],
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 30000
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

    const jid = msg.key.remoteJid;
    const agora = Date.now();
    const SEIS_HORAS = 6 * 60 * 60 * 1000; // Define o tempo de pausa em milissegundos

    // REGRA DE OURO: Se a mensagem veio do dono do bot (você/cliente)
    if (msg.key.fromMe) {
        atendimentoHumano[jid] = agora; // Registra o momento da intervenção humana
        console.log(`⏸️ Intervenção humana detectada para ${jid}. Bot pausado por 6h.`);
        return; // Sai da função para o bot não responder a si mesmo
    }

    // VERIFICAÇÃO DE PAUSA: O bot só continua se não houver intervenção recente
    if (atendimentoHumano[jid] && (agora - atendimentoHumano[jid] < SEIS_HORAS)) {
        console.log(`⏳ Bot em modo silêncio para ${jid} devido ao atendimento humano.`);
        return; // O bot não processa a mensagem da cliente
    }

    const texto = msg.message.conversation || msg.message.extendedTextMessage?.text;
    if (!texto) return;

    if (!historico[jid]) historico[jid] = [];
    historico[jid].push({ role: 'user', content: texto });

    try {
        const resposta = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...historico[jid].slice(-6)
            ],
            temperature: 0.2 // Reduz a criatividade para evitar "alucinações"
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
















