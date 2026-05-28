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

const { buscarOSM, obterCidadePorCoordenadas, buscarDadosPatrocinador } = require('./osm');

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
const ultimaBusca = {};
const ultimosResultados = {};


async function extrairIntencao(mensagem, historico = []) {
    try {
        const resposta = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                systemInstruction: {
                    parts: [{ text: `Você é um extrator de intenção para um chatbot de busca local.
Sua função é identificar O QUE o usuário está procurando e transformar em categorias limpas.

REGRA ABSOLUTA: Retorne SEMPRE e SOMENTE JSON puro em uma linha. NUNCA retorne texto livre, mesmo para perguntas fora do escopo, filosofia, piadas ou conversas. Sem JSON = erro crítico.

REGRAS DE SEGURANÇA E CONTEXTO:
1. DROGAS E SUBSTÂNCIAS ILÍCITAS: Se o usuário pedir substâncias ilegais (cocaína, maconha, crack, heroína), retorne: {"termos":["ajuda_saude"],"cidade":null}
⚠️ EXCEÇÃO CRÍTICA: "farmácia", "drogaria", "remédio", "medicamento" são buscas LEGÍTIMAS → retorne ["farmacia"]
⚠️ EXCEÇÃO CRÍTICA 2: "encher a cara", "tomar uma", "cerveja", "bebida", "beber", "boteco", "bar" são buscas por BAR → retorne ["bar"]. NUNCA classifique pedido de bebida alcoólica como "ajuda_saude".
2. CONTEÚDO ADULTO: Se pedir acompanhantes, pornografia ou serviços sexuais pagos, retorne: {"termos":["bloqueado_adulto"],"cidade":null}
3. FLUXOS/CONFIRMAÇÕES: Se a mensagem for apenas "pular", "sim", "não", "s", "n", "quero", "confirmar", retorne: {"termos":[],"cidade":null,"pedeIndicao":false,"piada":false,"respostaPiada":null}
4. ESPECIFICIDADE DE COMPRA: "trator pra comprar", "comprar carro" → ["concessionaria"]. Nunca ["mecanica"].
5. MÚLTIPLOS PEDIDOS: Separe em termos diferentes no array.
6. PIADAS: Se o usuário pedir algo impossível ou contraditório, defina "piada":true e crie "respostaPiada". Se o termo real não fizer sentido, deixe "termos":[].
⚠️ REGRA ANTI-HIPERFOCO: Analise CADA mensagem de forma COMPLETAMENTE INDEPENDENTE. NUNCA use nomes, termos ou assuntos de mensagens anteriores para criar piadas em mensagens novas. Se o usuário falou de "Landau" antes, isso NÃO deve aparecer em respostas sobre outros assuntos.
7. VESTUÁRIO: "chapéu", "bota", "calçado", "roupa de festa" → ["loja de roupas"] ou ["calcados"]
8. CIDADE PADRÃO: Sarandi - RS. Se o usuário disser apenas "Sarandi", force "cidade":"Sarandi - RS".
9. INDICAÇÕES: "me indica", "qual o melhor", "recomenda" → "pedeIndicao":true
10. LANDAU (carro antigo): "landau", "e o landau", "quero um landau" → ["concessionaria"] ou ["carro antigo"]. Não é piada automática.

Responda APENAS COM JSON válido em UMA única linha:
{"termos":["termo1"],"cidade":"cidade ou null","pedeIndicao":false,"piada":false,"respostaPiada":null}

Exemplos:
"quero pizza" -> {"termos":["pizzaria"],"cidade":"Sarandi - RS","pedeIndicao":false,"piada":false,"respostaPiada":null}
"quero encher a cara" -> {"termos":["bar"],"cidade":"Sarandi - RS","pedeIndicao":false,"piada":false,"respostaPiada":null}
"qual o sentido da vida?" -> {"termos":[],"cidade":null,"pedeIndicao":false,"piada":false,"respostaPiada":null}
"onde fica?" -> {"termos":[],"cidade":null,"pedeIndicao":false,"piada":false,"respostaPiada":null}
"e o landau?" -> {"termos":["concessionaria"],"cidade":"Sarandi - RS","pedeIndicao":false,"piada":false,"respostaPiada":null}
"barbearia para careca" -> {"termos":[],"cidade":null,"pedeIndicao":false,"piada":true,"respostaPiada":"Barbearia para careca? Eles só vendem cera para polir a cabeça! 😂 Mas se quiser aparar a barba, me avisa!"}
"preciso de remédio" -> {"termos":["farmacia"],"cidade":"Sarandi - RS","pedeIndicao":false,"piada":false,"respostaPiada":null}
"onde compro chapeu ou bota?" -> {"termos":["loja de roupas","calcados"],"cidade":"Sarandi - RS","pedeIndicao":false,"piada":false,"respostaPiada":null}
"qual o melhor mercado?" -> {"termos":["mercado"],"cidade":"Sarandi - RS","pedeIndicao":true,"piada":false,"respostaPiada":null}
"quero comer" -> {"termos":[],"cidade":null,"pedeIndicao":false,"piada":false,"respostaPiada":null}
"estou com fome" -> {"termos":[],"cidade":null,"pedeIndicao":false,"piada":false,"respostaPiada":null}
"quero comer alguma coisa" -> {"termos":[],"cidade":null,"pedeIndicao":false,"piada":false,"respostaPiada":null}
"quero comer um xis" -> {"termos":["lanchonete"],"cidade":"Sarandi - RS","pedeIndicao":false,"piada":false,"respostaPiada":null}
"quero comer um x" -> {"termos":["lanchonete"],"cidade":"Sarandi - RS","pedeIndicao":false,"piada":false,"respostaPiada":null}
"roupa de criança" -> {"termos":["roupa infantil"],"cidade":"Sarandi - RS","pedeIndicao":false,"piada":false,"respostaPiada":null}
"roupa de crianca" -> {"termos":["roupa infantil"],"cidade":"Sarandi - RS","pedeIndicao":false,"piada":false,"respostaPiada":null}
"roupa de bebe" -> {"termos":["roupa infantil"],"cidade":"Sarandi - RS","pedeIndicao":false,"piada":false,"respostaPiada":null}
"roupa de bebê" -> {"termos":["roupa infantil"],"cidade":"Sarandi - RS","pedeIndicao":false,"piada":false,"respostaPiada":null}
CRITICAL: Responda APENAS com o JSON puro em UMA linha, sem quebras de linha, sem marcacao de codigo, sem nenhuma formatação extra.` }]
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
                    maxOutputTokens: 1000
                }
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        let texto = resposta.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log("RAW IA:", texto);

        if (!texto) return { conversa: true, termos: [], cidade: null };

        texto = texto.replace(/```json/g, '').replace(/```/g, '').trim();

        // Verifica se o retorno é JSON válido antes de fazer parse
        if (!texto.startsWith('{')) {
            console.log("⚠️ IA retornou texto livre em vez de JSON. Tratando como conversa.");
            return { conversa: true, termos: [], cidade: null };
        }

        let parsed;
        try {
            parsed = JSON.parse(texto);
        } catch (e) {
            console.log('⚠️ JSON inválido da IA, tratando como conversa:', texto);
            return { conversa: true, termos: [], cidade: null};
        }

        // 💊 CONTRA-REGRA: Se o usuário digitou farmácia/remédio, impede o falso positivo de drogas
        const textoOriginal = mensagem?.toLowerCase() || "";
        if (textoOriginal.includes("farmacia") || textoOriginal.includes("farmácia") || textoOriginal.includes("remedio") || textoOriginal.includes("remédio")) {
            if (parsed.termos && parsed.termos.includes("ajuda_saude")) {
                console.log("🩹 Falso positivo de saúde corrigido para busca de Farmácia.");
                parsed.termos = ["farmacia"];
            }
        }

        // 🍺 CONTRA-REGRA: Bebida/bar não é abuso de substância
        const termosBar = ["encher a cara", "tomar uma", "cerveja", "bebida", "beber", "boteco", "bar"];
        if (termosBar.some(t => textoOriginal.includes(t))) {
            if (parsed.termos && parsed.termos.includes("ajuda_saude")) {
                console.log("🍺 Falso positivo de saúde corrigido para busca de Bar.");
                parsed.termos = ["bar"];
            }
        }

        // 1. Substâncias (Acolhimento)
        if (parsed.termos && parsed.termos.includes("ajuda_saude")) {
            console.log("🚨 Alerta de saúde/substâncias acionado.");
            return {
                erro: `Olha, eu sou apenas um assistente virtual de buscas locais, mas se você ou alguém que você conhece está passando por momentos difíceis com o uso de substâncias, saiba que existe apoio gratuito e sigiloso disponível. ❤️\n\n` +
                      `Você pode ligar para o *Viva Voz* pelo número *132* (orientação e apoio sobre drogas) ou procurar o *CAPS (Centro de Atenção Psicossocial)* aqui na região. Se cuida! 🙏✨`
            };
        }

        // 2. Conteúdo Adulto
        if (parsed.termos && parsed.termos.includes("bloqueado_adulto")) {
            console.log("🛑 Pedido de conteúdo adulto bloqueado.");
            return {
                erro: `Opa! 🛑 Eu fui programado para ser um guia local focado estritamente em comércios, lojas e prestadores de serviços de Sarandi - RS.\n\n` +
                    `Não consigo te ajudar com buscas de conteúdo adulto ou acompanhantes. Se quiser encontrar uma pizzaria, hotel, mercado ou farmácia, estou à disposição! 🧭`
            };
        }

        // 3. Fluxos de Conversa / Comandos ("pular", "sim", "não")
        if (!parsed.termos || parsed.termos.length === 0) {
            console.log("💬 Mensagem de conversa ou fluxo de cadastro detectada.");
            return { conversa: true, ...parsed };
        }

        if (parsed.termoBusca !== undefined) {
            return { termos: parsed.termoBusca ? [parsed.termoBusca] : [], ...parsed };
        }

        return { ...parsed, termos: parsed.termos || [] };

    } catch (err) {
        console.log("erro extrairIntencao", err.message);
        return { conversa: true, termos: [], cidade: null };
    }
}

async function conversarComIA(mensagem, historico, nomeUsuario, cidadeUsuario, ultimasPesquisas, primeiraInteracao = false) {
    const resumoPesquisas = ultimasPesquisas.length > 0
        ? ultimasPesquisas.map(p => p.termo).join(', ')
        : 'nenhuma ainda';

    try {
        const resposta = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                systemInstruction: {
                    parts: [{ text: `Você é a Nath, assistente virtual animado e jovial da JCI Sarandi! 🎉
Horário atual: ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })} (horário de Brasília).

Informações do usuário:
- Nome: ${nomeUsuario}
- Cidade: ${cidadeUsuario}
- Últimas buscas: ${resumoPesquisas}

COMO VOCÊ É:
- Animado, divertido e cheio de energia 🚀
- Fala como um amigo jovem, usa gírias leves
- Usa bastante emojis em todas as respostas
- Tem senso de humor e faz piadas ou tira sarro saudável quando o usuário brinca

COMO VOCÊ AJUDA:
- Quando souber o que o usuário quer, diga: "Me manda [nome do lugar] por texto ou áudio que eu busco pra você! 🔍"
- Se mencionar farmácia, remédio ou dor: "Digite farmácia que eu busco pra você! 💊"
- Se mencionar fome ou comida: APENAS pergunte o que quer comer. NUNCA sugira nomes de alimentos, categorias ou lugares.
- Se mencionar posto ou combustível: "Digite posto que eu busco pra você! ⛽"
- RECUPERAÇÃO: Se o usuário parecer confuso, responder algo inesperado ou fora de contexto, ofereça exemplos: "Posso te ajudar a encontrar: 🛒 Mercado | 🍕 Pizza | 💊 Farmácia | ⛽ Posto | 💈 Barbearia e muito mais! É só pedir! 😊"
- NUNCA encerre a conversa. Sempre deixe a porta aberta para uma nova busca.
- NUNCA invente nomes de lugares ou endereços reais
- NUNCA use asteriscos, underlines ou qualquer formatação markdown na resposta

SAUDAÇÕES:
- ${primeiraInteracao
    ? 'Esta é a primeira mensagem do usuário. Cumprimente com bom dia/boa tarde/boa noite conforme o horário atual.'
    : 'Você JÁ cumprimentou o usuário antes. NÃO repita a saudação de jeito nenhum. Vá direto ao ponto.'}
- Se for entre 00h-12h: bom dia | 12h-18h: boa tarde | 18h-23h: boa noite
- NUNCA mencione o horário ou o relógio na resposta` }]
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
                    temperature: 0.7,
                    maxOutputTokens: 2000
                }
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        return resposta.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Não entendi, pode repetir? 😅';

    } catch (err) {
        console.log('Erro conversarComIA:', err.message);
        return 'Opa, tive um probleminha! Tenta de novo? 😅';
    }
}

async function responderComRAG(mensagem, historico, empresas, nomeUsuario, cidadeUsuario, introducaoPersonalizada = "") {
    try {
        const patrocinadores = empresas.filter(e => e.patrocinador);
        const demais = empresas.filter(e => !e.patrocinador);

        let lista = '';

        // 🌟 PARCEIROS RECOMENDADOS (Estilo 1)
        if (patrocinadores.length > 0) {
            lista += "🌟 *PARCEIROS RECOMENDADOS*\n\n";
            for (const e of patrocinadores) {
                const estrelas = e.estrelas ? '⭐'.repeat(e.estrelas) + ' ' : '';
                lista += `🏢 *${e.nome}*\n`;
            if (e.telefone && e.telefone !== 'não informado') {
                const numeroLimpo = e.telefone.replace(/\D/g, '');
                const mensagem = encodeURIComponent('Ola, Vim pelo bot da Nath - JCI Sarandi!');
                lista += `📞 ${e.telefone}\n`;
                lista += `💬 wa.me/55${numeroLimpo}?text=${mensagem}\n`;
}
                lista += `📍 ${(e.endereco || 'Sarandi').replace(/,?\s*\d{5}-\d{3},?\s*/g, '').replace(/,?\s*Brasil\s*$/i, '').trim()}\n`;
                lista += e.aberto ? `🟢 Aberto agora\n` : `🔴 Fechado no momento\n`;
                lista += `\n`; // Linha em branco para separar os parceiros
            }
            lista += `\n`; // Espaço extra antes de começar o mapa
        }

        // 🔍 OUTRAS OPÇÕES NO MAPA (Estilo 1)
        if (demais.length > 0) {
            lista += "🔍 *OUTRAS OPÇÕES NO MAPA*\n\n";
            for (const e of demais) {
                lista += `📍 *${e.nome}*\n`;
                lista += `📍 ${(e.endereco || 'Sarandi').replace(/,?\s*\d{5}-\d{3},?\s*/g, '').replace(/,?\s*Brasil\s*$/i, '').trim()}\n`;
                lista += `🏢 ${e.endereco || 'Sarandi'}\n`;
                lista += e.aberto ? `🟢 Aberto agora\n` : `🔴 Fechado no momento\n`;
                lista += `\n`; // Linha em branco para separar os locais
            }
        }

        let abertura = introducaoPersonalizada;
        let encerramento = 'Se precisar de mais alguma coisa é só chamar! 🚀';

        if (!abertura) {
            const respostaGemini = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
                {
                    systemInstruction: {
                        parts: [{ text: `Você é a Nath, assistente jovial e descontraída da JCI Sarandi! 🎉
Fale como um amigo jovem, use gírias leves e emojis.
Se o usuário falar gírias, fale com ele do mesmo jeito.
Gere APENAS uma frase curta de abertura animada e uma frase curta de encerramento relacionadas ao tema buscado.
Exemplos de bom tom:
ABERTURA: Achei uns postos maneiros pra você abastecer! ⛽🔥
ABERTURA: Ó os restaurantes que tô te mandando! 🍽️😋
ABERTURA: Farmácias fresquinhas pra te salvar! 💊✨
ENCERRAMENTO: Qualquer coisa é só chamar, tô aqui! 🚀
ENCERRAMENTO: Se precisar de mais, me manda mensagem! 😊
NUNCA use asteriscos ou markdown.
Responda EXATAMENTE neste formato em uma única linha cada:
ABERTURA: [frase]
ENCERRAMENTO: [frase]` }]
                    },
                    contents: [{
                        role: 'user',
                        parts: [{ text: `O usuário pediu: "${mensagem}". Gere uma abertura animada e encerramento específicos para resultados de "${mensagem}".` }]
                    }],
                    generationConfig: {
                        temperature: 0.9,
                        maxOutputTokens: 500,
                        thinkingConfig: {
                            thinkingBudget: 0
                        }
                    }
                },
                { headers: { 'Content-Type': 'application/json' } }
            );

            const textoGemini = respostaGemini.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            console.log('🎨 Gemini abertura/encerramento:', textoGemini);
            const linhas = textoGemini.split('\n').map(l => l.trim()).filter(Boolean);
            const aberturaLinha = linhas.find(l => l.startsWith('ABERTURA:'));
            const encerramentoLinha = linhas.find(l => l.startsWith('ENCERRAMENTO:'));
            abertura = aberturaLinha?.replace('ABERTURA:', '').trim() || '🔍 Encontrei essas opções pra você!';
            encerramento = encerramentoLinha?.replace('ENCERRAMENTO:', '').trim() || 'Se precisar de mais alguma coisa é só chamar! 🚀';
        }

        const disclaimer = `💡 _Horários e telefones fornecidos pelo mapa podem sofrer alterações._`;
        return `${abertura}\n\n${lista}${encerramento}\n\n${disclaimer}`;

    } catch (err) {
        console.log('Erro RAG:', err.message);
        return null;
    }
}

async function transcreverAudio(base64Audio, mimeType = 'audio/ogg') {
    try {
        const mimeClean = mimeType.split(';')[0].trim();

        const resposta = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [{
                    parts: [
                        {
                            inlineData: {
                                mimeType: mimeClean,
                                data: base64Audio
                            }
                        },
                        {
                            text: 'Transcreva exatamente o que foi dito neste áudio em português brasileiro. Retorne APENAS a transcrição, sem comentários, sem aspas, sem formatação.'
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 500
                }
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        const texto = resposta.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return texto?.trim() || null;
    } catch (err) {
        console.log('Erro transcreverAudio:', err.message);
        return null;
    }
}

async function processarMensagem(telefone, mensagem, viaAudio = false) {
    const texto = String(mensagem).toLowerCase().trim();

    // 🩹 TRAVA DE SEGURANÇA MÁXIMA PARA FARMÁCIA
    const ehBuscaDeFarmacia = texto.includes('farmacia') || texto.includes('farmácia') || texto.includes('remedio') || texto.includes('remédio') || texto.includes('drogaria');

    const ehEmergenciaFisica = [
    'quebrei a perna', 'quebrei o braco', 'quebrei o braço',
    'torci o tornozelo', 'me machuquei', 'estou sangrando',
    'caí', 'cai e machuquei', 'preciso de socorro',
    'acidente', 'me cortei', 'dor forte', 'desmaiou',
    'infarto', 'derrame', 'nao consigo respirar', 'não consigo respirar'
    ].some(t => texto.includes(t));

    // 1. Filtros manuais básicos de segurança antes da IA
    if (!ehBuscaDeFarmacia) {
        const termosIlegais = ['droga', 'cocaina', 'cocaína', 'maconha', 'crack', 'heroina', 'heroína', 'traficante', 'arma', 'pistola', 'revolver', 'fuzil', 'explosivo', 'assassino', 'matar'];
        const termosAdultos = ['prostituta', 'prostituição', 'michê', 'garota de programa', 'garoto de programa', 'puteiro', 'bordel', 'sexo pago'];

        if (termosIlegais.some(t => texto.includes(t))) {
            const resposta = `Opa, esse tipo de coisa não posso te ajudar a encontrar! 😅\n\nSe você ou alguém que você conhece estiver passando por um momento difícil, o Viva Voz orienta anonimamente pelo telefone *132* ou o CAPS oferece atendimento gratuito aqui na região! 💙\n\nSe quiser buscar outra coisa em Sarandi, é só me dizer! 🔍`;
            await salvarHistorico(telefone, resposta, 'bot');
            return resposta;
        }

        if (termosAdultos.some(t => texto.includes(t))) {
            const resposta = `Opa! 🛑 Eu fui programado para ser um guia local focado estritamente em comércios, lojas e prestadores de serviços de Sarandi - RS.\n\nNão consigo te ajudar com buscas de conteúdo adulto ou acompanhantes. Se quiser encontrar outra coisa, estou à disposição! 🧭`;
            await salvarHistorico(telefone, resposta, 'bot');
            return resposta;
        }
    }

    // 2. Verificação de localização por GPS
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
            const respostaRAG = await responderComRAG(pendente.termoBusca, historico, osm, nomeUsuario, cidadeDetectada || pendente.cidade);

            if (respostaRAG) {
                await salvarHistorico(telefone, respostaRAG, 'bot');
                return respostaRAG;
            }
        }

        const resposta = `📍 Localizei você em ${cidadeDetectada || 'sua região'}! Agora me diz o que você precisa que eu busco perto de você! 🔍🚀`;
        await salvarHistorico(telefone, resposta, 'bot');
        return resposta;
    }

    // 3. Fluxo de Onboarding (Novo usuário / Cadastro)
    const usuarioExistente = await buscarUsuario(telefone);

        if (!usuarioExistente && !estadoOnboarding[telefone]) {
            if (viaAudio) {
                await salvarUsuario(telefone, 'Visitante', 'Sarandi');
            } else {
            estadoOnboarding[telefone] = { passo: 'aguardando_nome' };
            const resposta = `Eaí! 👋🤩 Eu sou a Nath, Assistente Virtual da JCI Sarandi!\n\nAntes de começar, me conta: qual é o seu nome? 😊\n\nCaso não queira se identificar, é só digitar *pular* que a gente segue assim mesmo!`;
            await salvarHistorico(telefone, resposta, 'bot');
            return resposta;
            }
    }

    if (estadoOnboarding[telefone]?.passo === 'aguardando_nome') {
        const nomeRecebido = mensagem.trim();
        const naoQuerIdentificar = ['não', 'nao', 'pular', 'pula', 'skip', 'anonimo', 'anônimo', 'tanto faz', 'sem nome', 'prefiro nao', 'prefiro não'].some(p => nomeRecebido.toLowerCase().includes(p));
        const nomeFinal = naoQuerIdentificar ? 'Visitante' : nomeRecebido;

        estadoOnboarding[telefone] = { passo: 'aguardando_confirmacao_cidade', nome: nomeFinal };
        const resposta = naoQuerIdentificar
            ? `Tudo bem, sem problemas! 😊\n\nVocê é de Sarandi, RS?\n\nDigite *sim* para continuar ou *não* caso seja de outra cidade!`
            : `Prazer, ${nomeFinal}! 🙌\n\nVocê é de Sarandi, RS?\n\nDigite *sim* para continuar ou *não* caso seja de outra cidade!`;

        await salvarHistorico(telefone, resposta, 'bot');
        return resposta;
    }

    if (estadoOnboarding[telefone]?.passo === 'aguardando_confirmacao_cidade') {
        const nome = estadoOnboarding[telefone].nome;
        const respostaUsuario = mensagem.trim().toLowerCase();
        const confirmou = ['sim', 's', 'yes', 'claro', 'isso', 'é', 'sou', 'confirmo', 'yep', 'com certeza'].some(p => respostaUsuario.includes(p));

        if (!confirmou) {
            // Ao invés de encerrar, pede a cidade
            estadoOnboarding[telefone] = { passo: 'aguardando_cidade_alternativa', nome };
            const resposta = `Sem problema${nome !== 'Visitante' ? `, ${nome}` : ''}! 😊 De qual cidade você é? 🏙️\n\nPor enquanto foco principalmente em Sarandi - RS, mas posso tentar te ajudar mesmo assim!`;
            await salvarHistorico(telefone, resposta, 'bot');
            return resposta;
        }

        await salvarUsuario(telefone, nome, 'Sarandi');
        delete estadoOnboarding[telefone];

        const resposta = `Perfeito${nome !== 'Visitante' ? `, ${nome}` : ''}! ✅ Tudo anotado!\n\nAgora é só me dizer o que você precisa em Sarandi que eu busco na hora! 🔍🚀\n\n🛒 Mercado | 🍕 Pizza | 💊 Farmácia\n⛽ Posto | 🍞 Padaria | 💈 Barbearia\n🏦 Banco | 🐾 Petshop | e muito mais...`;
        await salvarHistorico(telefone, resposta, 'bot');
        return resposta;
    }

    if (estadoOnboarding[telefone]?.passo === 'aguardando_cidade_alternativa') {
        const nome = estadoOnboarding[telefone].nome;
        const cidadeInformada = mensagem.trim() || 'Não informada';

        await salvarUsuario(telefone, nome, cidadeInformada);
        delete estadoOnboarding[telefone];

        const resposta = `Anotado! 📝 Vou te ajudar como puder${nome !== 'Visitante' ? `, ${nome}` : ''}! 🚀\n\nMeu foco é Sarandi - RS, mas me diz o que você precisa que eu dou um jeito! 🔍\n\n🛒 Mercado | 🍕 Pizza | 💊 Farmácia | ⛽ Posto`;
        await salvarHistorico(telefone, resposta, 'bot');
        return resposta;
    }


    const agradecimentos = ['obrigado', 'obrigada', 'valeu', 'vlw', 'brigado', 'thanks', 'grato'];
    
    if (Array.isArray(agradecimentos) && agradecimentos.some(a => texto.includes(a))) {
        return 'De nada! 😄🙌 Se precisar de mais alguma coisa é só chamar! 🚀';
    }

    await salvarHistorico(telefone, mensagem, 'usuario');

    const usuario = await buscarUsuario(telefone);
    const nomeUsuario = usuario?.nome || 'amigo';
    const cidadeUsuario = usuario?.cidade || 'Sarandi';
    const localizacao = localizacaoUsuario[telefone] || (usuario?.lat ? { lat: usuario.lat, lon: usuario.lon } : null);
    const cidadePadrao = 'Sarandi';

    const historico = await buscarHistorico(telefone);
    const ultimasPesquisas = await buscarUltimasPesquisas(telefone);

    // 4. Chamada de Intenção
    let intent;
    if (ehBuscaDeFarmacia) {
        console.log("💊 Busca direta por farmácia/remédio detectada.");
        intent = {
            termos: ["farmacia"],
            cidade: "Sarandi - RS",
            pedeIndicacao: false,
            piada: false,
        };
    } else if (ehEmergenciaFisica) {
        console.log("🚨 Emergência física detectada. Buscando hospital automaticamente");
        intent = {
            termos: ["hospital"],
            cidade: "Sarandi - RS",
            pedeIndicacao: false,
            piada: false,
        };
    } else {
        intent = await extrairIntencao(mensagem,historico);
    }

    if (intent.piada && (!intent.termos || intent.termos.length === 0)) {
        console.log("🎭 Piada sem termos reais detectada. Respondendo direto.");
        const textoPiada = intent.respostaPiada || "Hahaha, essa é boa! Mas por enquanto não encontrei essa opção por aqui. 😅";
        await salvarHistorico(telefone, textoPiada, 'bot');
        return textoPiada;
    }

    if (intent.conversa) {
        const primeiraInteracao = historico.length <= 2;
        const respostaIA = await conversarComIA(mensagem, historico, nomeUsuario, cidadeUsuario, ultimasPesquisas, primeiraInteracao);
        await salvarHistorico(telefone, respostaIA, 'bot');
        return respostaIA;
    }

    // 5. Histórico e Contexto do usuário
    const perguntasSobreResultados = ['nesses', 'nesse', 'neles', 'nelas', 'deles', 'delas', 'posso ir', 'posso sacar', 'eles aceitam', 'qual é melhor', 'qual deles', 'me indica', 'me recomenda', 'qual você indica'].some(p => texto.includes(p));

    if (perguntasSobreResultados && ultimosResultados[telefone]) {
        const respostaIA = await conversarComIA(mensagem, historico, nomeUsuario, cidadeUsuario, ultimasPesquisas, false);
        await salvarHistorico(telefone, respostaIA, 'bot');
        return respostaIA;
    }

    const pedindoMais = ['mais', 'tem mais', 'outras opções', 'outras opcoes', 'mais opcoes', 'mais opções', 'outros', 'tem mais opção', 'tem mais opcao'].some(p => texto.includes(p));
    if (pedindoMais && ultimaBusca[telefone] && (!intent.termos || intent.termos.length === 0)) {
        if (ultimosResultados[telefone]) {
            const respostaMais = 'Essas são todas as opções que encontrei por aqui! 😊 Se precisar de outra categoria é só me dizer! 🔍';
            await salvarHistorico(telefone, respostaMais, 'bot');
            return respostaMais;
        }
        intent.termos = [ultimaBusca[telefone]];
    }

    // 6. Fluxo de Múltiplos Pedidos
    if (intent.termos && intent.termos.length > 1) {
        let respostaFinal = [];
        for (const termo of intent.termos) {
            await salvarPesquisa(telefone, termo, cidadePadrao);
            const pats = await buscarPatrocinadores(termo, cidadePadrao);
            for (const p of pats) {
                const dados = await buscarDadosPatrocinador(p.nome);
                if (dados) {
                    p.endereco = p.endereco || dados.endereco;
                    p.telefone = p.telefone || dados.telefone;
                    p.aberto = dados.aberto;
                    p.horario = dados.horario;
                }
            }
            const emps = await buscarEmpresas(termo, cidadePadrao);
            let resultados = [];
            if (!emps || emps.length === 0) {
                const osm = await buscarOSM(termo, cidadePadrao, localizacao);
                if (osm && !osm.erro && osm.length > 0) {
                    const nomesPats = pats.map(p => p.nome.toLowerCase());
                    const osmFiltrado = osm.filter(o => {
                        const nomeOSM = o.nome.toLowerCase();
                        return !nomesPats.some(n => nomeOSM === n || nomeOSM.includes(n) || n.includes(nomeOSM));
                    });
                    resultados = [...pats.map(p => ({ ...p, patrocinador: true })), ...osmFiltrado];
                }
            } else {
                resultados = [...pats.map(p => ({ ...p, patrocinador: true })), ...emps];
            }

            const nomesVistos = new Set();
            resultados = resultados.filter(r => {
                const nomeLower = r.nome.toLowerCase();
                if (nomesVistos.has(nomeLower)) return false;
                nomesVistos.add(nomeLower);
                return true;
            });
            if (resultados.length > 0) {
                const rag = await responderComRAG(mensagem, [], resultados, nomeUsuario, cidadePadrao);
                if (rag) respostaFinal.push(rag);
            } else {
                respostaFinal.push(`❌ Não encontrei nada de "${termo}" em ${cidadePadrao}.`);
            }
        }
        const textoMultiplo = respostaFinal.join('\n\n');
        await salvarHistorico(telefone, textoMultiplo, 'bot');
        return textoMultiplo;
    }

    // 7. Fluxo de Pedido Único

    const normalizacaoTermos = {
    'loja de roupas de criança': 'roupa infantil',
    'loja de roupas infantil': 'roupa infantil',
    'roupa de criança': 'roupa infantil',
    'roupa de bebe': 'roupa infantil',
    'roupa de bebê': 'roupa infantil',
    'loja infantil': 'roupa infantil',
    'loja de roupas masculina': 'roupa masculina',
    'loja de roupas feminina': 'roupa feminina',
    'loja de roupas': 'loja de roupas',
    'xis': 'lanchonete hamburgueria',
    'quero um xis': 'lanchonete hamburgueria',
    'comer um xis': 'lanchonete hamburgueria',
    'hamburguer': 'hamburgueria',
    'burger': 'hamburgueria',
    'hot dog': 'cachorro quente',
    'cachorro quente': 'lanchonete',
    'xis': 'lanchonete',
    'x burguer': 'lanchonete',
    'quero um x': 'lanchonete',
    'comer um x': 'lanchonete',
    'fast food': 'lanchonete',
    'escritorio contabil': 'contabilidade',
    'escritório contábil': 'contabilidade',
    'escritorio de contabilidade': 'contabilidade',
    'escritório de contabilidade': 'contabilidade',
    'posto de gasolina': 'posto',
    'posto de combustivel': 'posto',
    'posto de combustível': 'posto',
    };
    const termoBusca = normalizacaoTermos[intent.termos[0]?.toLowerCase()] || intent.termos[0];
    ultimaBusca[telefone] = termoBusca;

    const cidadeFinal = intent.cidade ? intent.cidade : cidadePadrao;

    console.log('🧠 TERMO BUSCA:', termoBusca);
    console.log('🏙️ CIDADE:', cidadeFinal);

    await salvarPesquisa(telefone, termoBusca, cidadeFinal);

    const patrocinadores = await buscarPatrocinadores(termoBusca, cidadeFinal);
    console.log('⭐ PATROCINADORES:', patrocinadores.length);

    // Configuração do texto de introdução (Mapeia piadas ou interações antes)
    let mensagemIntroducao = "";

    if (intent.piada && intent.respostaPiada) {
        mensagemIntroducao = `${intent.respostaPiada}\n\n`;
    }

    for (const p of patrocinadores) {
        const dados = await buscarDadosPatrocinador(p.nome);
        if (dados) {
            p.endereco = p.endereco || dados.endereco;
            p.telefone = p.telefone || dados.telefone;
            p.aberto = dados.aberto;
            p.horario = dados.horario;
        }
    }

    const empresas = await buscarEmpresas(termoBusca, cidadeFinal);
    console.log('🏪 EMPRESAS SUBAPASE:', empresas?.length || 0);

    let resultadosMapa = [];

    if (!empresas || empresas.length === 0) {
        console.log('⚠️ Nada no Supabase, buscando no Google Places...');
        const osm = await buscarOSM(termoBusca, cidadeFinal, localizacao);

        if(osm && osm.foraDeCobertura) {
            console.log(`🧭 Cidade fora de cobertura detectada: ${osm.cidadeTentada}`);
            const respostaFora = `Bah, tchê! 🧭 Olhei aqui no mapa e vi que você buscou algo em *${osm.cidadeTentada}*. 🗺️\n\nPor enquanto o meu sistema opera EXCLUSIVAMENTE em Sarandi - RS! 🥹`;
            await salvarHistorico(telefone, respostaFora, 'bot');
            return respostaFora;
        }
        if (osm?.erro) return osm.erro;
        if (osm) resultadosMapa = osm;
    } else {
        resultadosMapa = empresas;
    }

const todosResultados = [
    ...patrocinadores.map(p => ({ ...p, aberto: true, patrocinador: true })), 
    ...(resultadosMapa || [])
];

    ultimosResultados[telefone] = todosResultados.map(e => e.nome).join(',');
    
    // Chama o novo formato minimalista que criamos
    const respostaRAG = await responderComRAG(termoBusca, [], todosResultados, nomeUsuario, cidadeFinal, mensagemIntroducao);

    if (respostaRAG) {
        await salvarHistorico(telefone, respostaRAG, 'bot');
        return respostaRAG;
    }

    // Código de segurança caso o RAG falhe por algum motivo
    let respostaFallback = (mensagemIntroducao || "") + '🏢 Achei isso pra você:\n\n';
    todosResultados.forEach(e => {
        const destaque = e.patrocinador ? '⭐ ' : '';
        respostaFallback += `${destaque}${e.nome} - ${e.telefone || 'Sem fone'} - ${e.endereco || 'Sarandi'}\n`;
    });

    await salvarHistorico(telefone, respostaFallback, 'bot');
    return respostaFallback;

} 

// Agora o module.exports fica isolado do lado de fora:
module.exports = { 
    extrairIntencao, 
    conversarComIA, 
    responderComRAG, 
    transcreverAudio, 
    processarMensagem 
    
};