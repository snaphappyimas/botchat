console.log("🚀 O BOT ESTÁ TENTANDO INICIAR AGORA...");

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const http = require("http");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const { Boom } = require("@hapi/boom");
const pino = require("pino");
const OpenAI = require("openai");

// -----------------------------------------------------------------------------
// CONFIGURAÇÕES GERAIS
// -----------------------------------------------------------------------------

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function tempoAleatorio(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

const PORT = process.env.PORT || 8080;

const PALAVRA_PAUSA = "#certo";
const PALAVRA_VOLTAR = "#se tiver dúvidas, me chama";

// Sessão salva dentro da pasta do projeto.
const SESSION_PATH = path.join(__dirname, "sessao_local");

// Arquivo dos contatos atendidos salvo dentro da pasta do projeto.
const ARQUIVO_CONTATOS = path.join(
  __dirname,
  "contatos_atendidos.json"
);

let pairingRequested = false;
let reconexaoAgendada = false;

// -----------------------------------------------------------------------------
// VALIDAÇÃO DO .ENV
// -----------------------------------------------------------------------------

const GROQ_API_KEY = (process.env.GROQ_API_KEY || "")
  .replace(/['"]+/g, "")
  .trim();

const PHONE_NUMBER = (process.env.PHONE_NUMBER || "")
  .replace(/\D/g, "")
  .trim();

if (!GROQ_API_KEY) {
  console.error("");
  console.error("❌ GROQ_API_KEY não foi encontrada no arquivo .env");
  console.error("");
  console.error("Confira se o seu .env possui:");
  console.error("GROQ_API_KEY=sua_chave_da_groq");
  console.error("");
  process.exit(1);
}

if (!PHONE_NUMBER) {
  console.error("");
  console.error("❌ PHONE_NUMBER não foi encontrado no arquivo .env");
  console.error("");
  console.error("Confira se o seu .env possui:");
  console.error("PHONE_NUMBER=5571999999999");
  console.error("");
  process.exit(1);
}

// -----------------------------------------------------------------------------
// CRIA A PASTA LOCAL DA SESSÃO
// -----------------------------------------------------------------------------

if (!fs.existsSync(SESSION_PATH)) {
  console.log("📂 Criando pasta de sessão local...");
  fs.mkdirSync(SESSION_PATH, { recursive: true });
}

// -----------------------------------------------------------------------------
// CLIENTE GROQ USANDO A BIBLIOTECA OPENAI
// -----------------------------------------------------------------------------

const groq = new OpenAI({
  apiKey: GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

console.log("⚡ Inteligência artificial configurada: GROQ");
console.log(`📱 Número configurado: ${PHONE_NUMBER}`);

// -----------------------------------------------------------------------------
// SERVIDOR LOCAL SIMPLES
// -----------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
  });

  res.end("Bot Online");
});

server.listen(PORT, () => {
  console.log(`🌐 Servidor local iniciado na porta ${PORT}`);
});

// -----------------------------------------------------------------------------
// CONTROLES EM MEMÓRIA
// -----------------------------------------------------------------------------

const historico = {};
const atendimentoHumano = {};

// -----------------------------------------------------------------------------
// PROMPT DO ATENDIMENTO
// -----------------------------------------------------------------------------

const SYSTEM_PROMPT = `Você é a Andreia Costa, especialista e vendedora do Método Ímãs Lucrativos e distribuidora oficial das Máquinas Americanas de fotoímãs. 
Seu objetivo é conduzir a conversa de forma amigável, humanizada e focada em conversão, seguindo estritamente as diretrizes:

- Nome do cliente: Use o nome do cliente assim que ele informar.
- Tom de voz: Acolhedor, entusiasta, profissional e direto ("Oiiiiie Que bom te ver por aqui...").
- Filosofia de vendas: Enfatize que o cliente NÃO precisa começar comprando a máquina americana. O mais importante é aprender a estruturar o negócio e vender no Método Ímãs Lucrativos.

LINKS OFICIAIS (Use apenas quando apropriado no fluxo):
- Curso Método Ímãs Lucrativos (R$197 ou 12x R$20,37 / Acesso Vitalício / 7 dias garantia): https://pay.kiwify.com.br/L2kL02v
- Máquinas Americanas no Mercado Livre (Tamanhos 5x5cm, 6,3x6,3cm, 8x5,3cm, 9x6,5cm / Garantia 1 ano): https://bit.ly/4cbD23V

REGRAS DE DÚVIDAS:
1. Impressão/Papel/Gabarito: Informe com educação que esses conteúdos e gabaritos são exclusivos para alunos do curso.
2. Rastreio de Máquina: Explique que a logística de entrega é 100% gerenciada pelo Mercado Livre no painel do comprador.`;

// -----------------------------------------------------------------------------
// CONTROLE DE CONTATOS JÁ ATENDIDOS
// -----------------------------------------------------------------------------

function carregarAtendidos() {
  try {
    if (!fs.existsSync(ARQUIVO_CONTATOS)) {
      return [];
    }

    const conteudo = fs.readFileSync(ARQUIVO_CONTATOS, "utf-8");

    if (!conteudo.trim()) {
      return [];
    }

    const atendidos = JSON.parse(conteudo);

    return Array.isArray(atendidos) ? atendidos : [];
  } catch (erro) {
    console.error(
      "⚠️ Não foi possível carregar contatos_atendidos.json:",
      erro.message
    );

    return [];
  }
}

function salvarNovoAtendido(jid) {
  try {
    const atendidos = carregarAtendidos();

    if (!atendidos.includes(jid)) {
      atendidos.push(jid);

      fs.writeFileSync(
        ARQUIVO_CONTATOS,
        JSON.stringify(atendidos, null, 2),
        "utf-8"
      );
    }
  } catch (erro) {
    console.error(
      "⚠️ Não foi possível salvar o contato atendido:",
      erro.message
    );
  }
}

// -----------------------------------------------------------------------------
// FUNÇÕES AUXILIARES
// -----------------------------------------------------------------------------

function obterTimestampMensagem(messageTimestamp) {
  if (!messageTimestamp) {
    return 0;
  }

  if (typeof messageTimestamp === "number") {
    return messageTimestamp;
  }

  if (typeof messageTimestamp === "bigint") {
    return Number(messageTimestamp);
  }

  if (typeof messageTimestamp?.toNumber === "function") {
    return messageTimestamp.toNumber();
  }

  const convertido = Number(messageTimestamp);

  return Number.isNaN(convertido) ? 0 : convertido;
}

function extrairTextoMensagem(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    ""
  );
}

function agendarReconexao() {
  if (reconexaoAgendada) {
    return;
  }

  reconexaoAgendada = true;

  console.log("🔄 Tentando reconectar em 5 segundos...");

  setTimeout(() => {
    reconexaoAgendada = false;

    iniciarBot().catch((erro) => {
      console.error(
        "❌ Falha durante a reconexão:",
        erro.message
      );
    });
  }, 5000);
}

// -----------------------------------------------------------------------------
// INICIALIZAÇÃO DO WHATSAPP
// -----------------------------------------------------------------------------

async function iniciarBot() {
  const { state, saveCreds } =
    await useMultiFileAuthState(SESSION_PATH);

  const { version } = await fetchLatestBaileysVersion();

  console.log(
    `📦 Versão do WhatsApp Web utilizada: ${version.join(".")}`
  );

  const sock = makeWASocket({
    auth: state,
    version,

    logger: pino({
      level: "silent",
    }),

    printQRInTerminal: false,

    mobile: false,

    browser: [
      "Ubuntu",
      "Chrome",
      "121.0.6167.85",
    ],

    syncFullHistory: false,

    connectTimeoutMs: 60000,

    defaultQueryTimeoutMs: 60000,

    keepAliveIntervalMs: 10000,

    markOnlineOnConnect: false,

    generateHighQualityLinkPreview: false,
  });

  sock.ev.on("creds.update", saveCreds);

  // ---------------------------------------------------------------------------
  // ATUALIZAÇÕES DA CONEXÃO
  // ---------------------------------------------------------------------------

  sock.ev.on("connection.update", async (update) => {
    const {
      connection,
      lastDisconnect,
    } = update;

    if (connection === "connecting") {
      console.log("🔌 Conectando ao WhatsApp...");
    }

    if (connection === "open") {
      console.log("");
      console.log("🤖 BOT MÉTODOS ÍMÃS LUCRATIVOS ONLINE");
      console.log("✅ WhatsApp conectado com sucesso.");
      console.log("");

      pairingRequested = false;
      reconexaoAgendada = false;
    }

    if (
      !state.creds.registered &&
      !pairingRequested
    ) {
      pairingRequested = true;

      console.log("");
      console.log("⏳ Aguardando sinal do WhatsApp...");
      console.log(
        `📱 O código será gerado para: ${PHONE_NUMBER}`
      );

      setTimeout(async () => {
        try {
          console.log("");
          console.log(
            `📡 Tentando gerar código para: ${PHONE_NUMBER}`
          );

          const code =
            await sock.requestPairingCode(PHONE_NUMBER);

          const codigoFormatado =
            code?.match(/.{1,4}/g)?.join("-") || code;

          console.log("");
          console.log(
            "************************************"
          );
          console.log(
            `👉 SEU CÓDIGO: ${codigoFormatado}`
          );
          console.log(
            "************************************"
          );
          console.log("");
        } catch (erro) {
          console.error(
            "❌ Não foi possível gerar o código:",
            erro.message
          );

          pairingRequested = false;
        }
      }, 5000);
    }

    if (connection === "close") {
      pairingRequested = false;

      const statusCode = new Boom(
        lastDisconnect?.error
      )?.output?.statusCode;

      const foiDesconectado =
        statusCode === DisconnectReason.loggedOut;

      console.log(
        `🔌 Conexão fechada. Motivo: ${statusCode || "desconhecido"}`
      );

      if (foiDesconectado) {
        console.error("");
        console.error(
          "❌ O WhatsApp desconectou a sessão."
        );
        console.error(
          "Apague a pasta sessao_local e execute novamente para gerar outro código."
        );
        console.error("");

        return;
      }

      agendarReconexao();
    }
  });

  // ---------------------------------------------------------------------------
  // RECEBIMENTO DE MENSAGENS
  // ---------------------------------------------------------------------------

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      try {
        if (!msg?.message) {
          continue;
        }

        const jid = msg.key.remoteJid;

        if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") {
          continue;
        }

        const timestampMensagem = obterTimestampMensagem(msg.messageTimestamp);
        const agoraRelogio = Math.floor(Date.now() / 1000);

        if (timestampMensagem && agoraRelogio - timestampMensagem > 30) {
          continue;
        }

        const texto = extrairTextoMensagem(msg);

        // COMANDOS MANUAIS ENVIADOS PELO PRÓPRIO DONO
        if (msg.key.fromMe) {
          const textoLower = texto.toLowerCase().trim();

          if (textoLower === PALAVRA_PAUSA) {
            atendimentoHumano[jid] = true;
            console.log(`🛑 Bot pausado manualmente para ${jid}`);
          }

          if (textoLower === PALAVRA_VOLTAR) {
            delete atendimentoHumano[jid];
            console.log(`✅ Bot reativado para ${jid}`);
          }

          continue;
        }

        if (!texto?.trim()) {
          continue;
        }

        console.log(`💬 Mensagem recebida de ${jid}: ${texto}`);

        // NÃO RESPONDE QUANDO O HUMANO ASSUMIU
        if (atendimentoHumano[jid]) {
          console.log(`👤 Atendimento humano ativo para ${jid}. Bot não respondeu.`);
          continue;
        }

        if (!historico[jid]) {
          historico[jid] = [];
        }

        // TRAVA PARA CONTATOS JÁ ATENDIDOS EM EXECUÇÕES ANTERIORES
        const jaAtendidos = carregarAtendidos();
        if (jaAtendidos.includes(jid) && historico[jid].length === 0) {
          console.log(`🚫 Pulando contato que já está na base de dados: ${jid}`);
          continue;
        }

        // TRAVA PARA CONVERSAS MUITO LONGAS
        if (historico[jid].length > 15) {
          console.log(`⏭️ Conversa longa detectada para ${jid}. Bot em silêncio.`);
          continue;
        }

        historico[jid].push({
          role: "user",
          content: texto.trim(),
        });

        // RESPOSTA DA GROQ
        const agoraBahia = new Date().toLocaleString("pt-BR", {
          timeZone: "America/Bahia",
        });

        console.log(`⚡ Enviando conversa para a Groq: ${jid}`);

const resposta = await groq.chat.completions.create({
  model: "openai/gpt-oss-120b",
  messages: [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}\n\nCONTEXTO: Hoje é ${agoraBahia}.`,
    },
    ...historico[jid].slice(-10),
  ],
  max_tokens: 400,
  temperature: 0.2,
});
        const textoFinal = resposta.choices?.[0]?.message?.content?.trim();

        if (!textoFinal) {
          console.error(`❌ A Groq não retornou texto para ${jid}.`);
          continue;
        }

        console.log(`🤖 Resposta gerada para ${jid}: ${textoFinal}`);

        salvarNovoAtendido(jid);

        // EFEITO DIGITANDO E ENVIO DA MENSAGEM DE TEXTO
        await sock.sendPresenceUpdate("composing", jid);
        await delay(tempoAleatorio(3, 6));

        await sock.sendMessage(jid, {
          text: textoFinal,
        });

        // SALVA A RESPOSTA NO HISTÓRICO
        historico[jid].push({
          role: "assistant",
          content: textoFinal,
        });

      } catch (erro) {
        console.error("❌ Erro ao processar mensagem:", erro.message);
      }
    }
  });

  return sock;
}

// -----------------------------------------------------------------------------
// INICIA O BOT
// -----------------------------------------------------------------------------

console.log("🏁 Chamando a função iniciarBot...");

iniciarBot().catch((erro) => {
  console.error("❌ FALHA CRÍTICA NO INÍCIO:", erro);
});

// -----------------------------------------------------------------------------
// TRATAMENTO DE ERROS GERAIS
// -----------------------------------------------------------------------------

process.on("unhandledRejection", (erro) => {
  console.error("❌ Erro assíncrono não tratado:", erro);
});

process.on("uncaughtException", (erro) => {
  console.error("❌ Erro não tratado:", erro);
});