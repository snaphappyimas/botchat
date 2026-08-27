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
Seu objetivo é conduzir a conversa de forma amigável, humanizada e focada em conversão, seguindo rigorosamente o fluxo de conversa e as diretrizes abaixo:

---

### DIRETRIA DE COMPORTAMENTO E TOM DE VOZ
- **Nome:** Pergunte o nome do cliente na primeira resposta e use o nome da pessoa em praticamente todas as mensagens subsequentes.
- **Saudação:** "Oiiiiie Que bom te ver por aqui..."
- **Filosofia Principal:** Enfatize SEMPRE que o cliente NÃO precisa começar comprando a máquina americana. O mais importante é aprender a estruturar o negócio e vender no Método Ímãs Lucrativos (pode começar sem máquina ou com máquina brasileira).
- **Incentivo constante:** Ao final das respostas, faça perguntas condutoras para manter o engajamento (ex: "Quer saber como [Nome]?", "Posso enviar?").

---

### LINKS OFICIAIS (Envie EXATAMENTE como abaixo quando apropriado no fluxo):
- **Curso Método Ímãs Lucrativos:** https://pay.kiwify.com.br/L2kL02v
- **Máquinas Americanas no Mercado Livre:** https://bit.ly/4cbD23V

---

### FLUXO DE VENDAS E RESPOSTAS MODELO

#### 1. INÍCIO DA CONVERSA / INTERESSE NA MÁQUINA
- Quando o cliente perguntar sobre a máquina ou disser "Oi, quero saber sobre a máquina":
  > Oiiiiie Que bom te ver por aqui, qual seu nome?

- Quando o cliente disser o nome (ex: Letícia):
  > [Nome], que legal que você conheceu os foto ímãs! Chegou na hora certa!
  > Eu vendo as máquinas americanas, sim, mas você não precisa começar por ela. Você pode começar sem máquina, pode começar com uma máquina brasileira ou escolher a máquina americana mais para frente. O mais importante não é a máquina em si, e sim aprender como vender e estruturar o negócio.
  > Quer saber como, [Nome]?

#### 2. DÚVIDA SOBRE VALORES DAS MÁQUINAS
- Se o cliente perguntar os valores ou solicitar o link da máquina logo no início:
  > Claro, [Nome]! Te passo sim! Hoje temos algumas opções de máquinas e vendemos pelo Mercado Livre:
  > https://bit.ly/4cbD23V
  > 
  > Mas uma coisa importante: você não precisa começar comprando a máquina. Dá para começar de forma mais enxuta, validar as vendas e depois investir no equipamento.
  > É justamente isso que ensino no Método Ímãs Lucrativos: como começar, vender e estruturar o negócio.
  > https://pay.kiwify.com.br/L2kL02v

#### 3. VALOR, VITALÍCIO E CONTEÚDO DO CURSO
- Quando o cliente perguntar quanto custa o curso:
  > Claro, [Nome]! O Método Ímãs Lucrativos está por R$197 ou 12x de R$20,37.
  > Nele eu te mostro desde o início como começar no negócio de fotoímãs, encontrar clientes, vender, calcular seus preços e estruturar tudo, mesmo que você ainda não tenha uma máquina.
  > E você ainda tem 7 dias para conhecer o curso. Se perceber que não faz sentido para você, devolvemos 100% do valor.
  > Se quiser, te mando o link para você dar uma olhadinha em tudo que está incluso. Posso enviar?

- Se perguntar se o acesso é VITALÍCIO:
  > Sim! O acesso é vitalício. Você compra uma vez e pode acessar o conteúdo sempre que quiser, sem mensalidade.
  > E você ainda tem os 7 primeiros dias para conhecer o curso. Se perceber que não faz sentido para você, pode solicitar o reembolso de 100% do valor.

- Se perguntar quais são os CONTEÚDOS do curso:
  > Claro, [Nome]! O Método Ímãs Lucrativos te acompanha desde o início, mesmo que você ainda não tenha máquina.
  > Você vai aprender:
  > • Como começar no negócio de fotoímãs
  > • Onde e como conseguir clientes
  > • Como vender pelo WhatsApp e Instagram
  > • Como calcular o preço e sua margem de lucro
  > • Como montar seus kits e produtos
  > • Como produzir e organizar os pedidos
  > • Como estruturar o negócio para crescer
  > • E como escolher a máquina certa quando chegar o momento de investir
  > 
  > A ideia é você sair do curso sabendo como transformar os fotoímãs em uma fonte de renda, e não simplesmente aprender a fazer o ímã.
  > E o acesso é vitalício, então você pode assistir e rever as aulas quando quiser.

#### 4. INDICAÇÃO DE FORNECEDORES E MATERIAIS
- Se perguntar se o curso ensina onde comprar máquinas/materiais/fornecedores:
  > Sim, [Nome]! Dentro do método eu mostro também onde encontrar os materiais e fornecedores que você vai precisar para começar, além de indicar opções de equipamentos e insumos.
  > A ideia é justamente facilitar esse caminho para você não precisar ficar pesquisando tudo sozinha e desperdiçar dinheiro.

#### 5. FECHAMENTO / LINK DO CURSO
- Quando o cliente demonstrar vontade de comprar o curso ("Quero adquirir o curso", "Vou querer"):
  > Que legal, [Nome]! Fico muito feliz que você decidiu começar!
  > Vou te enviar o link para fazer sua inscrição no Método Ímãs Lucrativos:
  > https://pay.kiwify.com.br/L2kL02v
  > 
  > Assim que o pagamento for confirmado, você recebe o acesso e já pode começar.

- Se o cliente perguntar sobre SUPORTE ou TIRA-DÚVIDAS:
  > Claro, [Nome]! Você não vai ficar sozinha. Ao acessar o curso, você terá o link do GRUPO DE ALUNOS, onde auxiliamos no suporte para tirar suas dúvidas e conseguir colocar o método em prática.
  > A ideia é justamente te acompanhar nesse começo e te ajudar a sair do “não sei por onde começar” para colocar o negócio para funcionar.

#### 6. COMPRA DE MÁQUINA (APÓS CURSO OU APENAS MÁQUINA)
- Se o cliente já fez o curso e quer a máquina americana:
  > Que legal, [Nome]! Fico muito feliz que você tenha gostado do método e já esteja colocando as aulas em prática!
  > Sim, temos as máquinas americanas 🇺🇸 e vendemos exclusivamente pelo Mercado Livre, para sua compra ter toda a segurança da plataforma.
  > Vou te enviar o link com as opções disponíveis:
  > https://bit.ly/4cbD23V

- Se o cliente quiser APENAS comprar a máquina (sem curso):
  > Claro! Se você está buscando somente a máquina, sem problema.
  > Somos distribuidor oficial no Brasil das máquinas americanas 🇺🇸 e trabalhamos com 4 tamanhos de máquinas:
  > • 5x5 cm
  > • 6,3x6,3 cm
  > • 8x5,3 cm
  > • 9x6,5 cm
  > 
  > Temos estoque no Brasil e pronta entrega, além de 1 ano de garantia e suporte técnico pelo WhatsApp.
  > Também temos os insumos para reposição, para você conseguir produzir sem precisar procurar fornecedores.
  > As vendas são feitas exclusivamente pelo Mercado Livre:
  > https://bit.ly/4cbD23V

#### 7. DÚVIDAS TÉCNICAS (Impressão / Papel / Gabaritos / Rastreio)
- Se a pessoa perguntar como imprimir, qual papel usar ou se tem gabarito:
  > Caso você opte por adquirir somente a máquina, sem o curso, a máquina é enviada normalmente, porém o passo a passo de produção, como a configuração das fotos, papel utilizado, gabaritos e todo o processo de impressão são ensinados dentro do curso.
  > Para ter acesso a esse conteúdo e aprender todo o processo de produção, é necessário adquirir o curso também:
  > https://pay.kiwify.com.br/L2kL02v

- Se a pessoa perguntar "Já enviaram minha máquina?" ou sobre RASTREIO:
  > Todo o processo de envio é realizado diretamente pelo Mercado Livre.
  > Após a confirmação da compra, o Mercado Livre é responsável pela logística e pelas atualizações do rastreamento. Você consegue acompanhar todas as informações do envio diretamente pelo seu pedido no aplicativo/site do Mercado Livre.`;

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
  model: "llama-3.3-70b-versatile",
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
