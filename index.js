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

// Configuração da OpenAI com limpeza automática de aspas e espaços
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.replace(/['"]+/g, '').trim() : ''
});

const historico = {};

const PROMPT_BASE = `
oi você é um assistente virtual amigável e prestativo. Cumprimente o usuário de forma calorosa e ofereça ajuda com qualquer dúvida ou tarefa que ele tenha. Mantenha um tom educado e profissional.
Fale em português do Brasil. tudo bem 

Regra 
1. Sempre responda em português do Brasil.
2. Comece a converça com um bom dia ou boa tarde, ou boa noite dependendo do horário.`;

async function ligarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('/app/sessao_nova');


    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.0'],
        connectTimeoutMs: 60000, 
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 30000 
    });

    sock.ev.on('creds.update', saveCreds);

   sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !sock.authState.creds.registered) {
            console.log('✅ QR Code gerado');
            const numeroTelefone = "5571981814555"; 
            
            setTimeout(async () => {
                try {
                    let code = await sock.requestPairingCode(numeroTelefone);
                    console.log(`\n🚀 SEU CÓDIGO DE PAREAMENTO: ${code}\n`);
                } catch (e) {
                    console.error("Erro ao solicitar código:", e);
                }
            }, 3000);
        }

        if (connection === 'close') {
            const erroCode = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
            if (erroCode !== DisconnectReason.loggedOut) ligarBot();
        } else if (connection === 'open') {
            console.log('🤖 BOT ONLINE!');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const remetente = msg.key.remoteJid;
        let textoParaIA = "";

        try {
            if (msg.message.conversation || msg.message.extendedTextMessage) {
                textoParaIA = msg.message.conversation || msg.message.extendedTextMessage.text;
            } 
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
                fs.unlinkSync(tempFile);
            }
            else if (msg.message.documentMessage && msg.message.documentMessage.mimetype === 'application/pdf') {
                console.log("📄 Lendo PDF...");
                const buffer = await downloadMediaMessage(msg, 'buffer');
                const data = await pdf(buffer);
                textoParaIA = `[CONTEÚDO DO PDF]: ${data.text.substring(0, 2000)}`;
            }

            if (!textoParaIA) return;

            console.log(`Mensagem de ${remetente}: ${textoParaIA}`);

            if (!historico[remetente]) historico[remetente] = [];
            historico[remetente].push({ role: 'user', content: textoParaIA });

            await new Promise(resolve => setTimeout(resolve, 10000));

            console.log('Solicitando resposta à OpenAI...');
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
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
            // --- BLOCO DE ERRO MELHORADO ---
            console.error('❌ ERRO AO PROCESSAR:');
            if (err.status) console.error('Status:', err.status);
            if (err.message) console.error('Mensagem:', err.message);
            if (err.code) console.error('Código:', err.code);
            // -------------------------------
        }
    });
}

ligarBot();