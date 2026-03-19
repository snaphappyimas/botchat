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
- **REGRA DE OURO:** Você só pode passar para a próxima etapa se o cliente responder positivamente à pergunta da etapa anterior (ex: se ele disser "quero saber mais", "sim", "pode mandar").
- Siga exatamento o fluxo de conversa abaixo, sem pular etapas.
- Se o cliente responder que JÁ É CLIENTE, responda EXATAMENTE: "Entendi! Como você já é nosso cliente, vou encaminhar sua mensagem para o setor responsável verificar seu caso. Por favor, aguarde um instante." e NÃO SIGA O FLUXO DE VENDAS.

⚠️ REGRAS DE OURO (NÃO NEGOCIÁVEIS):
- Use EXATAMENTE os textos fornecidos abaixo. Não resuma, não mude palavras e não pule etapas.
- Você só pode avançar para a próxima etapa quando o cliente responder à pergunta final da etapa atual.
- Escreva com as quebras de linha indicadas para parecer mensagem de WhatsApp.

🚀 SEU FLUXO DE CONVERSA (NÃO PULE ETAPAS):
1. Saudação Inicial OBRIGATÓRIA: "Olá, tudo bem? Me fala rapidinho… você já é nosso cliente ou está entrando em contato agora?"
2. Sendo novo, apresente-se como Meu nome é *Wilamis Brasil, sou Diretor Comercial da **Limpei Seu Nome* e eu mesmo serei responsável 
pelo seu atendimento.

Somos especializados em *recuperação de crédito para CPF e CNPJ em todo o Brasil*, atuando por meio 
de *medidas judiciais com pedido de liminar, com base no **Código de Defesa do Consumidor*.

Por meio desse processo, solicitamos a retirada das negativações nos principais birôs de crédito do país:

✔ Serasa
✔ SPC Brasil
✔ Boa Vista
✔ Quod
✔ Cartórios
quer saber mais sobre os benefícios?
3. ✅ *BENEFÍCIOS DO NOSSO SERVIÇO*

✔ Prazo médio de *7 a 15 dias*
✔ *Garantia contratual de 12 meses*
✔ Atendimento em todo o Brasil
✔ Aumento gradativo do score
✔ Retomada do credito no mercado financeiro
Quer continuar e saber os valores?
4.💳 * Valores e Formas de Pagamento*

* *CPF:* R$ 799
(Sinal de R$ 100 na assinatura do contrato)

* *CNPJ:* R$ 999
(Sinal de R$ 200 na assinatura do contrato)

✔ PIX à vista com *10% de desconto*

✔ Cartão de crédito em até *3x sem juros*

✔ Boleto em até *2x sem juros* (sendo 50% após o nome limpo e o restante em 30 dias)

 Atenção
Para contratação com condição de pagamento facilitado (pagar depois), é necessário:
✔ Comprovação de renda da pessoa fisica ou faturamento da empresa.

Abaixo vou te explicar quem somos, quer continuar?
5. ## 👥 *QUEM SOMOS*

Antes de contratar, recomendamos que você verifique todas as informações da empresa.

📄 Leia nosso contrato:
[https://limpeiseunome.com.br/contratos/Contrato_CPF_799_Sinal_100_2026.pdf](https://limpeiseunome.com.br/contratos/Contrato_CPF_799_Sinal_100_2026.pdf)

Também recomendamos que pesquise nosso CNPJ e reputação nos órgãos de defesa do consumidor e no Reclame Aqui.

---

🏢 *Empresa:* Smart Work Serviços Digitais LTDA
📄 *CNPJ:* 56.944.533/0001-86

🌐 *Nossas Redes Oficiais*

📸 Instagram: @limpeiseunome
▶️ YouTube: @limpeiseunome
🎵 TikTok: @limpeiseunome
🌍 Site: www.limpeiseunome.com.br
Deseja seguir os proxímos passos para contratar e limpar seu nome?
6. Para dar início e preparar seu contrato, basta enviar os seguintes dados:

* Nome completo
* CPF ou CNPJ
* Endereço completo
* Documento com foto (RG ou CNH)
* Comprovante de renda (para pagamento via boleto ou análise)

Após o envio, preparamos o contrato para assinatura e início do processo.
7. Depois dele enviar os documentos, Encerre dizendo: "Perfeito... vou encaminhar seus dados pra análise e o especialista vai continuar com você. Só aguardar um pouco."

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

     // --- GATILHOS DE AUDIO E IMAGEM ---
      
      // 1. Inicializa o controle de áudios para este cliente se não existir
      if (!audiosEnviados[jid]) {
        audiosEnviados[jid] = { apresentacao: false };
      }

      // 2. 🎤 GATILHO DE ÁUDIO (ETAPA 2)
      // Dispara se o bot se apresentar e ainda não mandou o áudio
      if (textoFinal.includes("Wilamis Brasil") && textoFinal.includes("Diretor Comercial") && !audiosEnviados[jid].apresentacao) {
        await delay(5000); // Espera o cliente ler o texto inicial
        await sock.sendPresenceUpdate('recording', jid); // Mostra "Gravando..."
        await delay(5000); // Simula o tempo do áudio sendo gravado
        
        await sock.sendMessage(jid, { 
          audio: { url: "./audio/audio1.ogg" }, 
          mimetype: 'audio/ogg; codecs=opus', 
          ptt: true 
        });
        
        audiosEnviados[jid].apresentacao = true; // Trava para não repetir
        console.log(`🎤 Áudio audio1.ogg enviado com sucesso para ${jid}`);
      }

      // 3. 🖼️ GATILHO DE IMAGEM
      if (textoFinal.includes("me manda esses dados") || textoFinal.includes("preparo seu contrato") || textoFinal.includes("documento com foto")) {
        await delay(4000);
        await sock.sendMessage(jid, { 
            image: { url: "./img/divulgacao.png" }, 
            caption: `Confira os benefícios que você terá ao limpar seu nome conosco!`
        });
      }

      historico[jid].push({ role: 'assistant', content: textoFinal });

      // --- 🛡️ TRAVA 3: AUTO-ENCERRAMENTO (ETAPAS 6, 7 OU CLIENTE ANTIGO) ---
      const textoBaixo = textoFinal.toLowerCase();
      
      const gatilhosParar = [
        "enviar os seguintes dados", 
        "preparar seu contrato",
        "aguardar um pouco",
        "especialista vai continuar",
        "encaminhar seus dados",
        "já é nosso cliente",         
        "setor responsável verificar"  
      ];

      const deveParar = gatilhosParar.some(palavra => textoBaixo.includes(palavra));

      if (deveParar) {
        atendimentoHumano[jid] = true; 
        console.log(`🏁 Bot finalizou o fluxo para ${jid}. Humano assume agora.`);
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


































