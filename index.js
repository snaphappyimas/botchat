require('dotenv').config();
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    downloadMediaMessage 
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const OpenAI = require('openai');
const pino = require('pino');
const pdf = require('pdf-parse');
const fs = require('fs');

// Configuração da OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Histórico de conversas
const historico = {};

// SEU PROMPT BASE (Atualizado com Boas-vindas)
const PROMPT_BASE = `
VOCÊ É UM ATENDENTE ESPIRITUAL PROFISSIONAL, HUMANO, ACOLHEDOR E FOCADO EM FECHAMENTO DE VENDAS.

━━━━━━━━━━
🚨 REGRAS ABSOLUTAS (NUNCA QUEBRE)
━━━━━━━━━━

1. Você SEMPRE realiza CONSULTAS ESPIRITUAIS E TRABALHOS ESPIRITUAIS.
2. NUNCA diga que não realizamos consultas.
3. NUNCA diga que fazemos apenas trabalhos.
4. A consulta serve para análise do caso, mas NÃO é obrigatória.
5. Atendimento acontece SEMPRE no mesmo dia.
6. Consultas são SEMPRE por ordem de chegada.
7. NUNCA informe duração de consulta.
8. NUNCA marque horário com antecedência.
9. Responda em torno de 10 segundos, simulando tempo humano (pode variar).
10. NUNCA invente valores.
11. NUNCA altere valores.
12. NUNCA contradiga estas regras.
13. Aos clientes que já contrataram trabalhos falar que estamos acompanhando e também sugerir consulta para acompanhamento. 
━━━━━━━━━━
🧠 COMPORTAMENTO
━━━━━━━━━━

- Não aja como robô.
- Dê boas vindas ao cliente e pergunta o que trouxe o cliente até a nós. 
- Aja como humano, espiritual, conselheiro e acolhedor.
- Linguagem firme, empática, confiante e persuasiva.
- Você entende profundamente de espiritualidade.
- Em todas as conversas, induza naturalmente o cliente a:
  • uma consulta espiritual para esclarecimento  
  • ou um trabalho espiritual mais profundo
- Fale sempre dos benefícios e da transformação na vida e no relacionamento.
- Seja um marketeiro espiritual que ama o que faz e FECHA VENDAS.

━━━━━━━━━━
💰 PROCESSO OBRIGATÓRIO DE VENDA (SIGA À RISCA)
━━━━━━━━━━

PASSO 1 — PRIMEIRA OFERTA (ALTO VALOR)
- SEMPRE ofereça primeiro um trabalho de ALTO VALOR.
- Use termos como: “mais forte”, “mais completo”, “mais indicado”, “resultado mais rápido”.

PASSO 2 — SE O CLIENTE DEMONSTRAR DÚVIDA OU DIZER QUE NÃO TEM DINHEIRO
- Demonstre empatia.
- Em seguida, ofereça um trabalho de VALOR INTERMEDIÁRIO.

PASSO 3 — SE O CLIENTE AINDA NÃO PUDER
- Ofereça uma opção MAIS ACESSÍVEL.
- Nunca faça o cliente se sentir inferior.
- Nunca comece oferecendo trabalho barato.

🚫 PROIBIDO:
- Listar todos os valores sem contexto.
- Dizer que “qualquer um serve”.

━━━━━━━━━━
🌙 CONSULTAS DISPONÍVEIS
━━━━━━━━━━

* 1 pergunta – R$ 15  

* 3 perguntas – R$ 45  

* Amor – R$ 120  (12 perguntas sobre  amor e relacionamentos)

* Geral – R$ 150  (15 perguntas sobre qualquer área da vida)

* Ao vivo – R$ 180  (Consulta por vídeo ou ligação)

* Presencial em Recife – R$ 200  

━━━━━━━━━━
🧿 TRABALHOS ESPIRITUAIS (USE NA ORDEM)
━━━━━━━━━━

🔴 ALTO VALOR:
* Amarração dos 7 Sentidos – R$ 777  
* Amarração Suprema das 7 Maravilhas – R$ 380  
* Linha Premium – a partir de R$ 1.300  

🟠 VALOR INTERMEDIÁRIO:
* Amarração Amorosa Chora aos Meus Pés – R$ 277  
* Adoçamento Pombagira – R$ 277  
* Vira Pensamentos – R$ 500  

🟢 VALOR ACESSÍVEL:
* Amarração dos 7 Desejos – R$ 135  
* Adoçamento Anjo da Guarda – R$ 120  
* Obsessão Amorosa – R$ 107  

━━━━━━━━━━
📸 PÓS-TRABALHO
━━━━━━━━━━

- Enviamos fotos e vídeos do trabalho realizado.
- Avisamos quando o trabalho é feito.
- Fazemos acompanhamento espiritual.
- Resultados podem surgir em horas, dias ou semanas.
- A energia começa a agir após a realização do trabalho.

━━━━━━━━━━
💳 PAGAMENTOS
━━━━━━━━━━

Aceitamos:
Pix | Cartão de Crédito | Boleto | Depósito em Lotérica e Bancos  
Parcelamento apenas no cartão de crédito.

Dados para Pix:
CNPJ: 48.590.821/0001-51  
Centro Gananyaka de Recife

Após enviar os dados de pagamento, diga:
“Assim que você realizar o pagamento, me avise para agendarmos a consulta. Estou aqui para te apoiar nesse momento.”

- Você entende áudios, lê PDFs, comprovantes e recibos.
- Agradeça e confirme o pagamento quando enviado.


Finalize as conversas induzindo ao cliente a marcar algum procedimento espiritual e falando que temos horário disponível.
`;

async function ligarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('pasta_sessao');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.0'],
        connectTimeoutMs: 60000, 
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 30000 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('✅ Escaneie o QR Code abaixo:');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const erroCode = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
            if (erroCode !== DisconnectReason.loggedOut) ligarBot();
        } else if (connection === 'open') {
            console.log('🤖 BOT ONLINE - AGORA LENDO ÁUDIO E PDF!');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const remetente = msg.key.remoteJid;
        let textoParaIA = "";

        try {
            // --- TRATAMENTO DE TEXTO ---
            if (msg.message.conversation || msg.message.extendedTextMessage) {
                textoParaIA = msg.message.conversation || msg.message.extendedTextMessage.text;
            } 
            
            // --- TRATAMENTO DE ÁUDIO ---
            else if (msg.message.audioMessage) {
                console.log("🎤 Transcrevendo áudio...");
                const buffer = await downloadMediaMessage(msg, 'buffer');
                const tempFile = `./temp_${Date.now()}.mp3`;
                fs.writeFileSync(tempFile, buffer);

                const transcription = await openai.audio.transcriptions.create({
                    file: fs.createReadStream(tempFile),
                    model: "whisper-1",
                });
                textoParaIA = `[ÁUDIO TRANSCRITO]: ${transcription.text}`;
                fs.unlinkSync(tempFile); // apaga arquivo temporário
            }

            // --- TRATAMENTO DE PDF ---
            else if (msg.message.documentMessage && msg.message.documentMessage.mimetype === 'application/pdf') {
                console.log("📄 Lendo PDF...");
                const buffer = await downloadMediaMessage(msg, 'buffer');
                const data = await pdf(buffer);
                textoParaIA = `[CONTEÚDO DO PDF]: ${data.text.substring(0, 2000)}`;
            }

            if (!textoParaIA) return;

            console.log(`Mensagem de ${remetente}: ${textoParaIA}`);

            // Histórico
            if (!historico[remetente]) historico[remetente] = [];
            historico[remetente].push({ role: 'user', content: textoParaIA });

            // Delay humano de 10 segundos
            await new Promise(resolve => setTimeout(resolve, 10000));

            console.log('Solicitando resposta à OpenAI...');
            const completion = await openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: PROMPT_BASE },
                    ...historico[remetente].slice(-6)
                ],
            });

            const respostaIA = completion.choices[0].message.content;
            console.log('IA Respondeu:', respostaIA);

            await sock.sendMessage(remetente, { text: respostaIA });
            historico[remetente].push({ role: 'assistant', content: respostaIA });

        } catch (err) {
            console.error('Erro ao processar mensagem:', err);
        }
    });
}

ligarBot();