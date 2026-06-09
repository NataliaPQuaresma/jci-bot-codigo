const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { processarMensagem, transcreverAudio } = require('./ia');

function iniciarBot() {
    const client = new Client({
        authStrategy: new LocalAuth()
    });

    // QR Code pra conectar
    client.on('qr', qr => {
        console.log('📲 Escaneia o QR Code no WhatsApp:');
        qrcode.generate(qr, { small: true });
    });

    // Bot pronto
    client.on('ready', () => {
        console.log('✅ Bot conectado com sucesso!');
    });

    // Mensagens recebidas
    client.on('message', async (msg) => {
        // Ignora mensagens enviadas pelo próprio bot ou grupos
        if (msg.fromMe || msg.isGroupMsg) return;

        const telefone = msg.from;
        if (!telefone) {
            console.log('⚠️ Telefone vazio ignorado');
            return;
    }
    console.log('📞 Formato do telefone:', telefone);

        // Cria uma execução isolada em background para esta mensagem específica
        (async () => {
            try {
                let resposta;

                // 📍 Localização (pin do mapa)
                if (msg.type === 'location') {
                    const lat = msg.location.latitude;
                    const lon = msg.location.longitude;
                    console.log(`📍 Localização recebida: ${lat}, ${lon}`);
                    resposta = await processarMensagem(msg.from, `__localizacao__${lat},${lon}`);

                // 🎤 Áudio / Mensagem de voz
                } else if (msg.type === 'ptt' || msg.type === 'audio') {
                    console.log('🎤 Áudio recebido, transcrevendo...');
                    await client.sendMessage(msg.from, '🎤 Deixa eu ouvir isso...');

                    const media = await msg.downloadMedia();

                    if (!media) {
                        await client.sendMessage(msg.from, '❌ Não consegui processar o áudio. Pode digitar sua mensagem? 😊');
                        return;
                    }

                    const textoTranscrito = await transcreverAudio(media.data, media.mimetype);

                    if (!textoTranscrito) {
                        await client.sendMessage(msg.from, '🤔 Não entendi bem o áudio. Pode digitar ou tentar de novo? 😊');
                        return;
                    }

                    console.log('📝 Transcrito:', textoTranscrito);
                    await client.sendMessage(msg.from, `🎤 _Entendi: "${textoTranscrito}"_`);
                    resposta = await processarMensagem(msg.from, textoTranscrito, true);
                    console.log('🔁 Resposta processarMensagem:', resposta);        

                // Mensagem de texto normal
                } else {
                    console.log('📩 Mensagem:', msg.body);
                    resposta = await processarMensagem(msg.from, msg.body);
                }

                // Proteção contra resposta vazia
                if (!resposta || (typeof resposta === 'string' && resposta.trim() === '') || (Array.isArray(resposta) && resposta.length === 0)) return;

                if (Array.isArray(resposta)) {
                    for (const parte of resposta) {
                        if (parte && parte.trim()) {
                            await client.sendMessage(msg.from, parte.trim());
                            await new Promise(r => setTimeout(r, 800));
                        }
                    }
                } else {
                    const LIMITE = 4000;
                    if (resposta.length <= LIMITE) {
                        await client.sendMessage(msg.from, resposta);
                    } else {
                        const linhas = resposta.split('\n');
                        let parte = '';
                        for (const linha of linhas) {
                            if ((parte + '\n' + linha).length > LIMITE) {
                                await client.sendMessage(msg.from, parte.trim());
                                await new Promise(r => setTimeout(r, 800));
                                parte = linha;
                            } else {
                                parte += '\n' + linha;
                            }
                        }
                        if (parte.trim()) await client.sendMessage(msg.from, parte.trim());
                    }
                }

            } catch (err) {
                console.error('❌ Erro interno ao processar mensagem do usuário:', err);
                await client.sendMessage(
                    msg.from,
                    '⚠️ Erro ao processar sua mensagem, tenta novamente.'
                );
            }
        })(); // Executa a função imediatamente liberando a thread principal
    });

    client.initialize();
}

module.exports = { iniciarBot };