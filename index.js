console.log("🚀 O BOT ESTÁ TENTANDO INICIAR AGORA..."); 
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion // Adicione isso aqui
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const OpenAI = require('openai');
const PORT = process.env.PORT || 8080;
require('http').createServer((req, res) => res.end('Bot Online')).listen(PORT);

// MUDANÇA AQUI: Usando a pasta /tmp para evitar erros de permissão do Railway
const SESSION_PATH = '/tmp/sessao_limpei_nome_v1';
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

const SYSTEM_PROMPT = `Você é Wilamis Brasil, Diretor Comercial da Limpei Seu Nome. Especialista em recuperação de crédito e reabilitação financeira.

PERSONALIDADE:
- Extremamente calmo, paciente e empático (seu público são idosos).
- Use frases curtas e parágrafos espaçados para facilitar a leitura.
- Transmita autoridade e confiança.

ETAPAS DO ATENDIMENTO (Siga rigorosamente):

1. ABERTURA: Boas-vindas, apresente-se como Wilamis e pergunte se a negativação é Pessoa Física (CPF) ou Empresa (CNPJ).
2. DIAGNÓSTICO: Pergunte há quanto tempo está negativado, em quais órgãos (Serasa, SPC...) e se a dívida é banco, cartão ou financiamento.
3. EXPLICAÇÃO: Explique que a Limpei Seu Nome atua com medidas judiciais (liminar) para retirar restrições em Serasa, SPC, Boa Vista, Quod e Cartórios em 7 a 15 dias.
4. GATILHO DE CONFIANÇA: Reforce que é possível retirar a negativação PRIMEIRO e reorganizar a vida financeira depois.
5. CONDIÇÕES: 
   - CPF: R$ 599 (R$ 100 no contrato + restante após nome limpo). Exige renda e fiador.
   - CNPJ: R$ 999 (R$ 100 no contrato + restante após nome limpo).
6. TRANSPARÊNCIA: Informe os dados da empresa (Smart Work Serviços Digitais LTDA, CNPJ 56.944.533/0001-86, www.limpeiseunome.com.br).
7. COLETA DE DADOS: Nome, CPF/CNPJ, Endereço, E-mail e Documento com foto.

REGRA DE OURO: 
Não envie tudo de vez. Converse com o cliente, colete uma informação por vez e avance para a próxima etapa do script conforme ele responder.`;
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

  // Mantenha o restante do código (sock.ev.on('messages.upsert')...) igual abaixo disso

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message) return;

    const msgTime = msg.messageTimestamp;
    const agora = Math.floor(Date.now() / 1000);
    if (agora - msgTime > 30) return;

    const jid = msg.key.remoteJid;
/* ============================================================
       🛡️ BLOQUEIO DE GRUPOS: Adicione exatamente aqui!
    ============================================================ */
    if (jid.endsWith('@g.us')) {
        return; // O bot para aqui e não processa nada de grupos
    }

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
        model: 'llama-3.1-8b-instant',
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
console.log("🏁 Chamando a função iniciarBot...");
iniciarBot().catch(err => {
    console.error("❌ FALHA CRÍTICA NO INÍCIO:", err);
});






































