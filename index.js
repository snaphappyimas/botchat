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
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function tempoAleatorio(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}
const PORT = process.env.PORT || 8080;
require('http').createServer((req, res) => res.end('Bot Online')).listen(PORT);

// MUDANÇA AQUI: Usando a pasta /tmp para evitar erros de permissão do Railway

const SESSION_PATH = '/tmp/sessao_limpei_nome_viss3';
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
const audiosEnviados = {};
const SYSTEM_PROMPT = `Você é Wilamis Brasil, Diretor Comercial da Limpei Seu Nome. Um vendedor expert em WhatsApp: natural, direto e focado em fechar contrato.

⚠️ COMPORTAMENTO:
- Comece TODA primeira interação EXATAMENTE com esta frase: "Olá, tudo bem? Me fala rapidinho… você já é nosso cliente ou está entrando em contato agora?"
- Escreva frases CURTAS e com QUEBRAS DE LINHA (estilo mensagem de áudio).
- Seja humano. Se o cliente mandar áudio ou parecer confuso, simplifique e seja empático.
- Sempre termine sua mensagem com uma pergunta para manter o controle da venda.

🚀 SEU FLUXO DE CONVERSA (NÃO PULE ETAPAS):
1. Saudação Inicial OBRIGATÓRIA: "Olá, tudo bem? Me fala rapidinho… você já é nosso cliente ou está entrando em contato agora?"
2. Sendo novo, apresente-se como Wilamis Brasil e explique que atuamos com recuperação de crédito via processo judicial com liminar (prazo de 7 a 15 dias).
3. Explique que retiramos as negativações no Serasa, SPC, Boa Vista, Quod e Cartórios para que o nome apareça limpo nas consultas.
4. Pergunte: "Seu caso é CPF ou empresa?".
5. Após ele responder, valide: "Pelo que você me falou, seu caso tem potencial sim!". Explique os benefícios (score, garantia de 12 meses e limpeza total).
6. Passe os valores: CPF é 799 reais (100 de sinal) e CNPJ é 999 reais (200 de sinal). Pagamento via PIX, Cartão 3x ou Boleto 2x. Empresas pagam o resto após o nome limpo.
7. Solicite os dados: Nome completo, CPF/CNPJ, endereço, documento com foto e comprovante de renda/faturamento.
8. Encerre dizendo: "Perfeito... vou encaminhar seus dados pra análise e o especialista vai continuar com você. Só aguardar um pouco."

🚫 LIMITES CRÍTICOS:
- NUNCA prometa "causa ganha" ou "aprovamos seu crédito em banco".
- FOCO ÚNICO: Retirada de negativações dos birôs.
- NUNCA mencione termos como "etapa", "passo", "prompt" ou "funil" na conversa.
- Se o cliente perguntar se é golpe, informe o CNPJ 56.944.533/0001-86.`;

const ARQUIVO_CONTATOS = './contatos_atendidos.json';

function carregarAtendidos() {
  if (!fs.existsSync(ARQUIVO_CONTATOS)) return [];
  return JSON.parse(fs.readFileSync(ARQUIVO_CONTATOS, 'utf-8'));
}

function salvarNovoAtendido(jid) {
  let atendidos = carregarAtendidos();
  if (!atendidos.includes(jid)) {
    atendidos.push(jid);
    fs.writeFileSync(ARQUIVO_CONTATOS, JSON.stringify(atendidos));
  }
}
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

    // -------------------------------------------------------------------------
    // [PONTO 2] A TRAVA ANTI-CLIENTE ANTIGO (ADICIONADA AQUI)
    // -------------------------------------------------------------------------
    const jaAtendidos = carregarAtendidos();
    if (jaAtendidos.includes(jid) && (!historico[jid] || historico[jid].length === 0)) {
        console.log(`🚫 Pulando contato que já está na base de dados: ${jid}`);
        return;
    }

    // --- LOGICA DE MENSAGEM (TEXTO OU AUDIO) ---
    let texto = "";
    if (msg.message.conversation || msg.message.extendedTextMessage?.text) {
      texto = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    } 
    else if (msg.message.audioMessage) {
      console.log("🎤 Áudio detectado de " + jid);
      const tempFile = `./${jid.replace(/[^0-9]/g, '')}_${Date.now()}.ogg`;
      try {
        const buffer = await downloadMediaMessage(msg, 'buffer', {});
        fs.writeFileSync(tempFile, buffer);
        const transcription = await groq.audio.transcriptions.create({
          file: fs.createReadStream(tempFile),
          model: "whisper-large-v3",
        });
        texto = transcription.text;
      } catch (err) {
        console.error("❌ Erro áudio:", err);
      } finally {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      }
    }

    // --- CONTROLE MANUAL (#pausar / #voltar) ---
    if (msg.key.fromMe) {
      const textoLower = texto.toLowerCase().trim();
      if (textoLower === PALAVRA_PAUSA) {
        atendimentoHumano[jid] = true; // Pausa infinita até dar #voltar
        console.log(`🛑 Bot pausado manualmente para ${jid}`);
      }
      if (textoLower === PALAVRA_VOLTAR) {
        delete atendimentoHumano[jid];
        console.log(`✅ Bot reativado para ${jid}`);
      }
      return;
    }

    // --- 🛡️ TRAVA 1: SE O HUMANO ASSUMIU OU ESTÁ PAUSADO ---
    if (atendimentoHumano[jid]) return;

    if (!texto) return;

    if (!historico[jid]) historico[jid] = [];
    
    // --- 🛡️ TRAVA 2: NÃO RESPONDER CLIENTES ANTIGOS ---
    // Se o bot nunca falou com ele e já tem mensagens no chat, ou se o histórico do bot passou de 15 mensagens
    if (historico[jid].length > 15) {
        console.log(`⏭️ Cliente antigo ou conversa longa detectada (${jid}). Bot em silêncio.`);
        return;
    }

    historico[jid].push({ role: 'user', content: texto });

    try {
      const agoraBahia = new Date().toLocaleString("pt-BR", {timeZone: "America/Bahia"});
// --- histórico da conversa ---
      const resposta = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\nCONTEXTO: Hoje é ${agoraBahia}.` },
          ...historico[jid].slice(-5) 
        ],
        max_tokens: 400 
      });

      const textoFinal = resposta.choices[0].message.content;

      // --- DELAY HUMANO ---
      await sock.sendPresenceUpdate('composing', jid);
      await delay(tempoAleatorio(15, 20)); 
      await sock.sendMessage(jid, { text: textoFinal });

      // -------------------------------------------------------------------------
      // [PONTO 3] SALVAR O CONTATO (ADICIONADA AQUI)
      // -------------------------------------------------------------------------
      salvarNovoAtendido(jid);

     // --- GATILHOS DE AUDIO/IMAGEM (COM TRAVA DE REPETIÇÃO E NOVOS GATILHOS) ---
      
      // Inicializa o controle de áudios para este cliente se não existir
      if (!audiosEnviados[jid]) {
        audiosEnviados[jid] = { audio1: false, audio2: false };
      }

    // --- GATILHOS DE IMAGEM (ÁUDIOS E VÍDEOS REMOVIDOS) ---
      
      // IMAGEM: Envio de contrato/dados quando solicitado
      if (textoFinal.includes("me manda esses dados") || textoFinal.includes("preparo seu contrato") || textoFinal.includes("documento com foto")) {
        await delay(4000);
        await sock.sendMessage(jid, { 
            image: { url: "./img/divulgacao.png" }, 
            caption: `Confira os benefícios que você terá ao limpar seu nome conosco!`
        });
      }

      historico[jid].push({ role: 'assistant', content: textoFinal });

      // --- 🛡️ TRAVA 3: AUTO-ENCERRAMENTO ---
      // Se o bot mandou a mensagem final (Etapa 5 ou Setor Responsável), ele se auto-pausa
      if (textoFinal.includes("setor responsável") || textoFinal.includes("especialista vai continuar com você")) {
        atendimentoHumano[jid] = true; 
        console.log(`🏁 Bot finalizou a parte dele para ${jid}. Entregando para o humano.`);
      }

    } catch (err) {
      console.error('❌ Erro Groq:', err.message);
    }
  });
}

console.log("🏁 Chamando a função iniciarBot...");
iniciarBot().catch(err => {
    console.error("❌ FALHA CRÍTICA NO INÍCIO:", err);
});


































