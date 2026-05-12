const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { processarMensagem } = require('./ia');

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

  // mensagens recebidas
client.on('message', async (msg) => {
    try {
        // ignora mensagens enviadas pelo próprio bot
        if (msg.fromMe) return;

        // ignora mensagens de grupo
        if (msg.isGroupMsg) return;

        let resposta;

        // verifica se é uma localização (pin do mapa)
        if (msg.type === 'location') {

            // extrai latitude e longitude da mensagem
            const lat = msg.location.latitude;
            const lon = msg.location.longitude;

            console.log(`📍 Localização recebida: ${lat}, ${lon}`);

            // passa a localização pro processarMensagem como texto especial
            // usamos um formato fixo pra identificar que é localização
            resposta = await processarMensagem(msg.from, `__localizacao__${lat},${lon}`);

        } else {
            // mensagem de texto normal
            console.log('📩 Mensagem:', msg.body);
            resposta = await processarMensagem(msg.from, msg.body);
        }

        // proteção contra resposta vazia
        if (!resposta || resposta.trim() === '') return;

    const LIMITE = 1000;
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

    } catch (err) {
        console.error('❌ Erro ao processar mensagem:', err);
        await client.sendMessage(
            msg.from,
            '⚠️ Erro ao processar sua mensagem, tenta novamente.'
        );
    }
});

    client.initialize();
}

module.exports = { iniciarBot };