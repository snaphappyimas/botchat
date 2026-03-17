console.log("🚀 O BOT ESTÁ TENTANDO INICIAR AGORA..."); 
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion, 
  downloadMediaMessage // Adicionado para baixar áudio
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const OpenAI = require('openai');
const PORT = process.env.PORT || 8080;
require('http').createServer((req, res) => res.end('Bot Online')).listen(PORT);

// MUDANÇA AQUI: Usando a pasta /tmp para evitar erros de permissão do Railway

const SESSION_PATH = '/tmp/sessao_limpei_nome_v2';
const UMA_HORA = 60 * 60 * 1000;
const PALAVRA_PAUSA = "#pausar";
const PALAVRA_VOLTAR = "#voltar";

let pairingRequested = false;

// Cria a pasta de forma segura
if (!fs.existsSync(SESSION_PATH)) {
  console.log("📂 Criando pasta de sessão em /tmp...");
  fs.mkdirSync(SESSION_PATH, { recursive: true });
}

const groq = new OpenAI({
  apiKey: (process.env.GROQ_API_KEY || "").replace(/['"]+/g, '').trim(),
  baseURL: 'https://api.groq.com/openai/v1'
});

const historico = {};
const atendimentoHumano = {};
const SYSTEM_PROMPT = `Você é Wilamis Brasil, Diretor Comercial da Limpei Seu Nome.

Seu objetivo é seguir o SCRIPT ELITE de forma rigorosa.

ESTILO DE ESCRITA:
- Use frases curtas.
- QUEBRE LINHAS entre as frases (estilo WhatsApp).
- Nunca mande parágrafos longos.

ETAPA 1 (ABERTURA OBRIGATÓRIA) - Se o cliente der "Oi", "Bom dia" ou iniciar a conversa, responda exatamente neste formato:
"Olá, tudo bem?

Meu nome é Wilamis Brasil, sou Diretor Comercial da Limpei Seu Nome.

A gente atua em todo o Brasil com recuperação de crédito.

Limpamos seu nome por meio de processo judicial com liminar, normalmente entre 7 a 15 dias, com garantia contratual de 12 meses.

Atuamos em todos os birôs:
Serasa, SPC, Boa Vista, Quod e Cartórios.

Agora me diz…
seu caso é CPF ou empresa?"

ETAPA 2 (DIAGNÓSTICO):
Após a resposta do cliente, diga: "Perfeito… me fala rapidinho: faz quanto tempo que tá negativado? sabe onde tá sujo?"
Assim que ele responder, use obrigatoriamente: "Pelo que você me falou… seu caso tem potencial sim."

ETAPA 3 (EXPLICAÇÃO E VALORES):
- Explique que é jurídico (Código de Defesa do Consumidor) e usa liminar.
- Preço CPF: R$ 799 (Sinal R$ 100).
- Preço CNPJ: R$ 999 (Sinal R$ 200).
- SEMPRE pergunte ao final: "Até aqui fez sentido pra você?"

TRATAMENTO DE OBJEÇÕES:
- Se falarem "É golpe?": Cite o CNPJ 56.944.533/0001-86 e a garantia em contrato.
- Se falarem "Eu devo": Diga que a lei permite revisão e suspensão em muitos casos.
Seu público: Idosos (use frases curtas, simples e diretas).

REGRAS DE OURO:
1. NUNCA responda textos longos. Máximo 3 frases por vez.
2. Não pule etapas. Se o cliente não respondeu a pergunta anterior, repita-a gentilmente.
3. Não invente que "não precisa de informações". Siga o script até o fechamento.
4. Se o cliente der "Bom dia/Boa tarde", use a hora atual fornecida no contexto para saudar corretamente.

FLUXO:
Etapa 1: Boas-vindas + Perguntar se é CPF ou CNPJ.
Etapa 2: Perguntar tempo de negativação, órgãos (SPC/Serasa) e tipo de dívida.
Etapa 3: Explicar serviço (Liminar Judicial, 7-15 dias, limpa antes de pagar o grosso).
Etapa 4: Preços (CPF: 599 | CNPJ: 999) + R$ 100 de entrada.
Etapa 5: Pedir dados para contrato.


Regras
1. nunca fale de forma grossa.
2. Sempre trate os clientes de forma profissional e amigável.
3. Responda os áudios de forma profissional seguindo a lógica.
4. Nunca tente vender tudo de uma vez. Colete uma informação por vez e espere o cliente responder. 
3. Responda os áudios de forma profissional seguindo a lógica. 
`;
async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

 // Buscando a versão mais recente do WhatsApp Web para evitar erro 405
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version, // Força a versão estável
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    mobile: false, // Garante que não está tentando usar API de celular
    browser: ['Mac OS', 'Chrome', '121.0.6167.85'],
    syncFullHistory: false, // Não baixa histórico, foca na conexão
    connectTimeoutMs: 60000, // Dá 1 minuto para o socket estabilizar
    defaultQueryTimeoutMs: 0, 
    keepAliveIntervalMs: 10000,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log(`🔌 Conexão fechada. Motivo: ${reason}`);
      
      // Se der erro 405 ou 428, reconecta em 2 segundos (mais rápido)
      const reconectarEm = (reason === 405 || reason === 428) ? 2000 : 5000;
      setTimeout(() => iniciarBot(), reconectarEm);
    }

    if (connection === 'open') {
      console.log('🤖 BOT LIMPEI SEU NOME ONLINE');
      pairingRequested = false;
    }

    if (!state.creds.registered && !pairingRequested) {
      pairingRequested = true;
      const num = process.env.PHONE_NUMBER;
      if (!num) {
        console.log("❌ PHONE_NUMBER não configurado!");
        return;
      }

      console.log("⏳ Aguardando sinal do WhatsApp...");

      setTimeout(async () => {
        try {
          // Só tenta se o socket ainda estiver conectado
          console.log(`📡 Tentando gerar código para: ${num}`);
          const code = await sock.requestPairingCode(num);
          console.log(`\n************************************`);
          console.log(`👉 SEU CÓDIGO: ${code}`);
          console.log(`************************************\n`);
        } catch (err) {
          console.log("❌ Erro na requisição. O socket resetou. Tentando novamente...");
          pairingRequested = false;
        }
      }, 15000); 
    }
  });

 

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message) return;

    const msgTime = msg.messageTimestamp;
    const agoraRelogio = Math.floor(Date.now() / 1000);
    if (agoraRelogio - msgTime > 30) return;

    const jid = msg.key.remoteJid;

    if (jid.endsWith('@g.us')) return; 

    let texto = "";

    if (msg.message.conversation || msg.message.extendedTextMessage?.text) {
      texto = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    } 
    else if (msg.message.audioMessage) {
      console.log("🎤 Áudio detectado de " + jid + ". Transcrevendo...");
      try {
        const buffer = await downloadMediaMessage(msg, 'buffer', {});
        const tempFile = `./${jid.replace(/[^0-9]/g, '')}.ogg`;
        fs.writeFileSync(tempFile, buffer);

        const transcription = await groq.audio.transcriptions.create({
          file: fs.createReadStream(tempFile),
          model: "whisper-large-v3",
        });

        texto = transcription.text;
        fs.unlinkSync(tempFile);
        console.log(`📝 Áudio convertido em texto: ${texto}`);
      } catch (err) {
        console.error("❌ Erro ao processar áudio:", err);
        texto = "[Erro ao processar áudio]";
      }
    }

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

    if (atendimentoHumano[jid]) {
      const tempoDecorrido = Date.now() - atendimentoHumano[jid];
      if (tempoDecorrido < UMA_HORA) return;
      else delete atendimentoHumano[jid];
    }

    if (!texto) return;

    if (!historico[jid]) historico[jid] = [];
    historico[jid].push({ role: 'user', content: texto });

    try {
      const agoraBahia = new Date().toLocaleString("pt-BR", {timeZone: "America/Bahia"});

      const resposta = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\nCONTEXTO ATUAL: Hoje é ${agoraBahia}.` },
          ...historico[jid].slice(-7) 
        ],
        max_tokens: 300 
      });

      const textoFinal = resposta.choices[0].message.content;

      // 1. Envia Texto
      await sock.sendMessage(jid, { text: textoFinal });

      // 2. Envia Áudio 1
      if (textoFinal.includes("Diretor Comercial") && textoFinal.includes("CPF ou empresa")) {
        await sock.sendMessage(jid, { 
          audio: { url: "./audio/audio1.ogg" },
          mimetype: 'audio/ogg; codecs=opus', 
          ptt: true 
        });
      }

      // 3. Envia Áudio 2
      if (textoFinal.includes("potencial sim")) {
        await sock.sendMessage(jid, { 
          audio: { url: "./audio/audio2.ogg" },
          mimetype: 'audio/ogg; codecs=opus', 
          ptt: true 
        });
      }

      // 4. Envia Imagem
      if (textoFinal.includes("preparo seu contrato") || textoFinal.includes("me manda seus dados")) {
        await sock.sendMessage(jid, { 
          image: { url: "./img/divulgacao.png" }, 
          caption: `Tudo pronto para iniciarmos seu processo!\n\n✔ Prazo médio de 7 a 15 dias.\n✔ Garantia contratual de 12 meses.\n✔ Pagamento após o nome limpo.`
        });
      }

      historico[jid].push({ role: 'assistant', content: textoFinal });

    } catch (err) {
      console.error('❌ Erro no processamento:', err.message);
    }
  }); 
}

console.log("🏁 Chamando a função iniciarBot...");
iniciarBot().catch(err => {
    console.error("❌ FALHA CRÍTICA NO INÍCIO:", err);
});



































