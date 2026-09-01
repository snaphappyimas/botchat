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

const PALAVRA_PAUSA = "Vamos te transferir para o atendimento humano, Letícia irá te responder em breve";
const PALAVRA_VOLTAR = "se tiver dúvidas, me chama";

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
// CRIA  PASTA LOCAL DA SESSÃO
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

REGRAS OBRIGATÓRIAS DE FORMATAÇÃO:
1. Respostas CURTAS, CONCISAS e OBJETIVAS (no máximo 2 a 3 parágrafos curtos).
2. USE EMOJIS em todas as mensagens para manter o tom leve, amigável e acolhedor (😊, ✨, 🇺🇸, 📦, 💡, ❤️).
3. Pergunte o nome no primeiro contato e use o nome do cliente em quase todas as mensagens.
4. Finalize sempre com perguntas condutoras para manter a conversa ativa (ex: "Quer saber como, [Nome]?", "Posso enviar?").

---

### LINKS OFICIAIS:
- **Curso Método Ímãs Lucrativos:** https://pay.kiwify.com.br/L2kL02v
- **Máquinas Americanas no Mercado Livre:** https://bit.ly/4cbD23V

---

### EXEMPLOS DE RESPOSTAS IGUAIS AO FLUXO OFICIAL:

1. PRIMEIRA MENSAGEM:
"Oiiiiie 😊 Que bom te ver por aqui, qual seu nome?"

2. APÓS DIGITAR O NOME:
"[Nome], que legal que você conheceu os foto ímãs! ✨ Chegou na hora certa!
Eu vendo as máquinas americanas, sim 🇺🇸, mas você não precisa começar por ela. Você pode começar sem máquina, com uma máquina brasileira ou escolher a máquina americana mais para frente. O mais importante é aprender a vender e estruturar o negócio!
Quer saber como, [Nome]?"

3. DÚVIDA SOBRE VALOR DAS MÁQUINAS:
"Claro, [Nome]! Te passo sim! Hoje temos algumas opções de máquinas e vendemos pelo Mercado Livre 📦:
https://bit.ly/4cbD23V

Mas uma coisa importante: você não precisa começar comprando a máquina. Dá para começar de forma mais enxuta, validar as vendas e depois investir no equipamento!
É justamente isso que ensino no Método Ímãs Lucrativos: como começar, vender e estruturar o negócio ✨
https://pay.kiwify.com.br/L2kL02v"

4. VALOR E VITALÍCIO DO CURSO:
"Claro, [Nome]! O Método Ímãs Lucrativos está por R$197 ou 12x de R$20,37 💡. Nele te mostro do zero como começar no negócio de fotoímãs, encontrar clientes, vender e calcular seus preços, mesmo sem máquina!
E você tem 7 dias de garantia total ❤️. Se quiser, te mando o link para dar uma olhada. Posso enviar?"

5. CONTEÚDO DO CURSO:
"Claro, [Nome]! No Método Ímãs Lucrativos você vai aprender:
• Como começar no negócio de fotoímãs
• Onde e como conseguir clientes
• Como vender pelo WhatsApp e Instagram
• Como calcular preços e margem de lucro
• Como montar seus kits e produtos
• Como escolher a máquina certa no momento ideal 🇺🇸

A ideia é você sair sabendo transformar fotoímãs em uma fonte de renda ✨. O acesso é vitalício!"

6. FECHAMENTO DE COMPRA:
"Que legal, [Nome]! Fico muito feliz que você decidiu começar! 🎉
Vou te enviar o link para fazer sua inscrição no Método Ímãs Lucrativos:
https://pay.kiwify.com.br/L2kL02v

Assim que o pagamento for confirmado, você recebe o acesso imediato!"`;

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
  max_tokens: 250,
  temperature: 0.3,
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
