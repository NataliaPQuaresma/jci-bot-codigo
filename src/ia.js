const path = require('path');
const fs = require('fs');
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
});

const axios = require('axios');
const {
    buscarEmpresas,
    buscarHistorico,
    salvarHistorico,
    buscarPatrocinadores
} = require('./banco');

const { buscarOSM, obterCidadePorCoordenadas } = require('./osm');

const {
    buscarUsuario,
    salvarUsuario,
    salvarLocalizacao,
    salvarPesquisa,
    buscarUltimasPesquisas
} = require('./usuarios');

const estadoOnboarding = {};
const localizacaoUsuario = {};
const buscaPendente = {};


async function extrairIntencao(mensagem, historico = []) {
    try {
        const resposta = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                systemInstruction: {
                    parts: [{ text: `Você é um extrator de intenção para um chatbot de busca local.
Sua função é identificar O QUE o usuário está procurando. 
IMPORTANTE: Se a mensagem for uma piada, humor, sarcasmo ou pergunta claramente impossível, retorne o termoBusca como null.
Toda e qualquer pergunta DEVE ser respondida.
Responda APENAS COM JSON válido, sem explicações:
{
"termoBusca":"o que o usuário esta buscando em uma ou mais palavras, ou null se for conversa",
"cidade": "cidade mencionada ou null"
}
Exemplos:
"quero pizza hoje" -> {"termoBusca":"pizzaria","cidade":null}
"preciso de remédio em sarandi" -> {"termoBusca":"farmacia","cidade":"sarandi"}
"onde comprar pão?" -> {"termoBusca":"padaria","cidade":null}
"tô com fome" -> {"termoBusca":null,"cidade":null}
"sushi" -> {"termoBusca":"sushi","cidade":null}
"tem barbearia pra carecas?" -> {"termoBusca":null,"cidade":null}
CRITICAL: Responda APENAS com o JSON puro em UMA linha, sem quebras de linha, sem marcacao de codigo, sem nenhuma formatação extra. Exemplo: {"termoBusca":"farmacia","cidade":null}`}]
                },
                contents: [
                    ...historico.slice(-4).map(h => ({
                        role: h.papel === 'usuario' ? 'user' : 'model',
                        parts: [{ text: h.mensagem }]
                    })),
                    {
                        role: 'user',
                        parts: [{ text: mensagem }]
                    }
                ],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 500
                }
            },
            {
                headers: { 'Content-Type': 'application/json' }
            }
        );
        let texto = resposta.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log("RAW IA:", texto);

        if (!texto) return { termoBusca: null, cidade: null };

        texto = texto.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(texto);
    } catch (err) {
        console.log("erro extrairIntencao", err.message);
        console.log("detalhes:", JSON.stringify(err.response?.data));
        return { termoBusca: null, cidade: null };
    }
}


async function conversarComIA(mensagem, historico, nomeUsuario, cidadeUsuario, ultimasPesquisas) {
    const resumoPesquisas = ultimasPesquisas.length > 0
        ? ultimasPesquisas.map(p => p.termo).join(', ')
        : 'nenhuma ainda';

    try {
        const resposta = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                systemInstruction: {
                    parts: [{ text: `Você é o Jayci, assistente virtual animado e jovial da JCI Sarandi! 🎉
Horário atual: ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })} (horário de Brasília).

Informações do usuário:
- Nome: ${nomeUsuario}
- Cidade: ${cidadeUsuario}
- Últimas buscas: ${resumoPesquisas}

COMO VOCÊ É:
- Animado, divertido e cheio de energia 🚀
- Fala como um amigo jovem, usa gírias leves
- Usa bastante emojis em todas as respostas
- Tem senso de humor e faz piadas quando o usuário brinca

COMO VOCÊ AJUDA:
- Quando souber o que o usuário quer, diga: "Digite [nome do lugar] que eu busco pra você! 🔍"
- Se mencionar farmácia, remédio ou dor: "Digite farmácia que eu busco pra você! 💊"
- Se mencionar fome ou comida: pergunta o que quer comer antes de sugerir
- Se mencionar posto ou combustível: "Digite posto que eu busco pra você! ⛽"
- NUNCA invente nomes de lugares ou endereços reais
- IGNORE o histórico para decidir a saudação — use APENAS o horário atual para isso
- Se for entre 00h-12h: bom dia | 12h-18h: boa tarde | 18h-23h: boa noite
- NUNCA mencione o horário ou o relógio na resposta — apenas use o horário para saudar corretamente

SAUDAÇÕES:
- Use o horário atual pra saudar corretamente (bom dia, boa tarde, boa noite) ` }]
                },
                contents: [
                    ...historico.slice(-4).map(h => ({
                        role: h.papel === 'usuario' ? 'user' : 'model',
                        parts: [{ text: h.mensagem }]
                    })),
                    {
                        role: 'user',
                        parts: [{ text: mensagem }]
                    }
                ],
                generationConfig: {
                    temperature: 0.5,
                    maxOutputTokens: 2000
                    
                }
            },
            {
                headers: { 'Content-Type': 'application/json' }
            }
        );

        return resposta.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Não entendi, pode repetir? 😅';

    } catch (err) {
        console.log('Erro conversarComIA:', err.message);
        return 'Opa, tive um probleminha! Tenta de novo? 😅';
    }
}
async function responderComRAG(mensagem, historico, empresas, nomeUsuario, cidadeUsuario) {
const contextoEmpresas = empresas.map(e => {
    const status = e.aberto ? 'ABERTO' : 'FECHADO';
    const rua = e.endereco.split(',')[0];
    const horario = e.horario ? `| ${e.horario}` : '';
    return `${e.nome} | ${status} | ${e.telefone} | ${rua} ${horario}`;
}).join('\n');

    const hora = new Date().toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit'
    });

    try {
        const resposta = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                systemInstruction: {
                    parts: [{ text: `Você é o Jayci, assistente da JCI Sarandi.
Horário atual: ${hora}.
Responda APENAS com a lista abaixo, sem introdução, sem despedida, sem texto extra.
Use ✅ ABERTO se o status for ABERTO e ❌ FECHADO se for FECHADO
Para cada estabelecimento use uma linha com: [emoji status] Nome | 📞 Telefone | 📍 Rua
- Se o estabelecimento for patrocinador (campo patrocinador = true), mostre as estrelas antes do nome conforme o campo estrelas: 1=⭐, 2=⭐⭐, 3=⭐⭐⭐, 4=⭐⭐⭐⭐, 5=⭐⭐⭐⭐⭐
Antes da lista escreva UMA linha curta e animada sobre os resultados, com emoji.
- Se o estabelecimennto for patrocinador, destaque assim:
━━━━━━━━━━━━━━━
⭐⭐⭐ Nome (estrelas conforme o campo estrelas)
📞 Telefone | 📍 Endereço
━━━━━━━━━━━━━━━
- Os patrocinadores aparecem SEMPRE primeiro antes dos outros resultados
- Depois dos patrocinadores mostre os demais normalmente com 🟢/🔴



Estabelecimentos:
${contextoEmpresas}` }]
                },
                contents: [
                    ...historico.slice(-4).map(h => ({
                        role: h.papel === 'usuario' ? 'user' : 'model',
                        parts: [{ text: h.mensagem }]
                    })),
                    {
                        role: 'user',
                        parts: [{ text: mensagem }]
                    }
                ],
                generationConfig: {
                    temperature: 0.5,
                    maxOutputTokens: 2000
                }
            },
            {
                headers: { 'Content-Type': 'application/json' }
            }
        );

        const textoRAG = resposta.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
console.log('📝 RESPOSTA RAG:', textoRAG);
return textoRAG;

    } catch (err) {
        console.log('Erro RAG:', err.message);
        return null;
    }
}


async function processarMensagem(telefone, mensagem) {

    const texto = String(mensagem).toLowerCase().trim();

    // verifica se a mensagem é uma localização enviada pelo bot
    if (mensagem.startsWith('__localizacao__')) {
        const coords = mensagem.replace('__localizacao__', '').split(',');
        const lat = parseFloat(coords[0]);
        const lon = parseFloat(coords[1]);

        localizacaoUsuario[telefone] = { lat, lon };
        await salvarLocalizacao(telefone, lat, lon);
        console.log(`📍 Localização salva: ${lat}, ${lon}`);

        const usuario = await buscarUsuario(telefone);
        const nomeUsuario = usuario?.nome || 'amigo';

        const cidadeDetectada = await obterCidadePorCoordenadas(lat, lon);
        console.log(`🏙️ Cidade detectada: ${cidadeDetectada}`);

        if (cidadeDetectada && usuario) {
            await salvarUsuario(telefone, usuario.nome, cidadeDetectada);
        }

        const pendente = buscaPendente[telefone];

        if (pendente) {
            delete buscaPendente[telefone];

            const osm = await buscarOSM(pendente.termoBusca, cidadeDetectada || pendente.cidade, { lat, lon });

            if (!osm || osm.length === 0 || osm?.erro) {
                return `❌ Não encontrei nada de "${pendente.termoBusca}" perto de você 😕`;
            }

            const historico = await buscarHistorico(telefone);

            const respostaRAG = await responderComRAG(
                pendente.termoBusca, historico, osm, nomeUsuario, cidadeDetectada || pendente.cidade
            );

            if (respostaRAG) {
                await salvarHistorico(telefone, respostaRAG, 'bot');
                return respostaRAG;
            }

            let respostaOSM = `📍 Encontrei isso perto de você em ${cidadeDetectada || pendente.cidade}:\n\n`;
            osm.forEach(e => {
                respostaOSM += `📍 ${e.nome}\n📞 ${e.telefone || 'não informado'}\n📌 ${e.endereco}\n\n`;
            });
            await salvarHistorico(telefone, respostaOSM, 'bot');
            return respostaOSM;
        }

        const resposta = `📍 Localizei você em ${cidadeDetectada || 'sua região'}! Agora me diz o que você precisa que eu busco perto de você! 🔍🚀`;
        await salvarHistorico(telefone, resposta, 'bot');
        return resposta;
    }

    // Verifica se é usuário novo (sem cadastro e sem onboarding em andamento)
    const usuarioExistente = await buscarUsuario(telefone);

    if (!usuarioExistente && !estadoOnboarding[telefone]) {
        estadoOnboarding[telefone] = { passo: 'aguardando_nome' };

        const resposta = `Eaí! 👋🤩 Eu sou a Jeicy Assistente Virtual da JCI Sarandi!

Antes de começar, me conta: qual é o seu nome? 😊`;

        await salvarHistorico(telefone, resposta, 'bot');
        return resposta;
    }

    // ETAPA 1 DO ONBOARDING
    if (estadoOnboarding[telefone]?.passo === 'aguardando_nome') {
        const nomeRecebido = mensagem.trim();

        estadoOnboarding[telefone] = {
            passo: 'aguardando_cidade',
            nome: nomeRecebido
        };

        const resposta = `Prazer, ${nomeRecebido}! 🙌

Agora me diz: qual cidade você está?`;

        await salvarHistorico(telefone, resposta, 'bot');
        return resposta;
    }

    // ETAPA 2 DO ONBOARDING
    if (estadoOnboarding[telefone]?.passo === 'aguardando_cidade') {
        const nome = estadoOnboarding[telefone].nome;
        const cidade = mensagem.trim();

        if (cidade.toLowerCase() !== 'sarandi') {
            delete estadoOnboarding[telefone];
            const resposta = `Poxa ${nome}, por enquanto só temos cobertura em Sarandi 😕 Em breve expandimos pra mais cidades! 🚀`;
            await salvarHistorico(telefone, resposta, 'bot');
            return resposta;
        }

        await salvarUsuario(telefone, nome, cidade);
        delete estadoOnboarding[telefone];

        const resposta = `Perfeito, ${nome}! ✅ Tudo anotado!

Agora é só me dizer o que você precisa em ${cidade} que eu busco na hora! 🔍🚀

🛒 Mercado | 🍕 Pizza | 💊 Farmácia
⛽ Posto | 🍞 Padaria | 💈 Barbearia
🏦 Banco | 🐾 Petshop | e muito mais...`;

        await salvarHistorico(telefone, resposta, 'bot');
        return resposta;
    }

    const agradecimentos = ['obrigado', 'obrigada', 'valeu', 'vlw', 'brigado', 'thanks', 'grato'];
    if (agradecimentos.some(a => texto.includes(a))) {
        return 'De nada! 😄🙌 Se precisar de mais alguma coisa é só chamar! 🚀';
    }

    await salvarHistorico(telefone, mensagem, 'usuario');

    const usuario = await buscarUsuario(telefone);
    const nomeUsuario = usuario?.nome || 'amigo';
    const cidadeUsuario = usuario?.cidade || 'Sarandi';

    const historico = await buscarHistorico(telefone);
    const ultimasPesquisas = await buscarUltimasPesquisas(telefone);

    const intent = await extrairIntencao(mensagem, historico);

    if (!intent?.termoBusca) {
        const respostaIA = await conversarComIA(
            mensagem, historico, nomeUsuario, cidadeUsuario, ultimasPesquisas
        );
        await salvarHistorico(telefone, respostaIA, 'bot');
        return respostaIA;
    }

    const termoBusca = intent.termoBusca;

    const localizacao = localizacaoUsuario[telefone]
        || (usuario?.lat ? { lat: usuario.lat, lon: usuario.lon } : null);
    const cidade = 'Sarandi';

    console.log('🧠 TERMO BUSCA:', termoBusca);
    console.log('🏙️ CIDADE:', cidade);

    await salvarPesquisa(telefone, termoBusca, cidade);

    const patrocinadores = await buscarPatrocinadores(termoBusca, cidade);
    console.log('⭐ PATROCINADORES:', patrocinadores.length);

    const empresas = await buscarEmpresas(termoBusca, cidade);

    console.log('🏪 EMPRESAS:', empresas);

    if ((!empresas || empresas.length === 0) && patrocinadores.length ===0) {
        console.log('⚠️ Nada no Supabase, buscando no Google Places...');

        const osm = await buscarOSM(termoBusca, cidade, localizacao);

        if (osm?.erro) return osm.erro;

        if (!osm || osm.length === 0) {
            return `❌ Não encontrei nada de "${termoBusca}" em ${cidade}.`;
        }

        const respostaRAG = await responderComRAG(
            mensagem, historico, osm, nomeUsuario, cidade
        );

        if (respostaRAG) {
            await salvarHistorico(telefone, respostaRAG, 'bot');
            return respostaRAG;
        }

        let respostaOSM = '🌍 Encontrei isso aqui:\n\n';
        osm.forEach(e => {
            respostaOSM += `📍 ${e.nome}\n📞 ${e.telefone || 'não informado'}\n📌 ${e.endereco}\n\n`;
        });
        await salvarHistorico(telefone, respostaOSM, 'bot');
        return respostaOSM;
    }

    const todosResultados = [...patrocinadores.map(p => ({
        ...p,
        aberto: true,
        endereco: 'Sarandi',
        telefone: p.telefone || '',
        patrocinador: true
    })), ...agradecimentos(empresas || [])];

    const respostaRAG = await responderComRAG(
        mensagem, historico, todosResultados, nomeUsuario, cidade
    );

    if (respostaRAG) {
        await salvarHistorico(telefone, respostaRAG, 'bot');
        return respostaRAG;
    }

    let respostaFinal = '🏢 Achei isso pra você:\n\n';
    empresas.forEach(e => {
        const destaque = e.patrocinador ? '⭐ ' : '';
        respostaFinal += `${destaque}${e.nome} - ${e.telefone} - ${e.endereco}\n`;
    });

    await salvarHistorico(telefone, respostaFinal, 'bot');
    return respostaFinal;
}

module.exports = { processarMensagem };