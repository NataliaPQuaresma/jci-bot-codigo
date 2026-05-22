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

REGRAS CRÍTICAS DE SEGURANÇA E CONTEXTO:
1. DROGAS E SUBSTÂNCIAS ILÍCITAS: Se o usuário pedir substâncias entorpecentes ilegais (ex: maconha, cocaína, sintéticas) ou manifestar comportamento ligado a abuso de substâncias, retorne obrigatoriamente: {"termos": ["ajuda_saude"], "cidade": null}. 
⚠️ ATENÇÃO CRÍTICA: Termos como "farmácia", "drogaria", "remédio", "medicamento" ou "comprar aspirina" são buscas comerciais LEGÍTIMAS. Para eles, ignore esta regra e retorne o termo normal ["farmacia"].
2. CONTEÚDO ADULTO: Se o usuário pedir acompanhantes, pornografia ou conteúdo adulto, retorne obrigatoriamente: {"termos": ["bloqueado_adulto"], "cidade": null}
3. FLUXOS DE CADASTRO/CONFIRMAÇÃO: Se a mensagem do usuário for apenas "pular", "sim", "não", "s", "n", "quero", "confirmar" (respostas a perguntas do fluxo), retorne obrigatoriamente o array vazio: {"termos": [], "cidade": null}
4. ESPECIFICIDADE DE COMPRA: Se o usuário quer comprar maquinário ou veículos (ex: "trator pra comprar", "comprar carro"), classifique como ["concessionaria"] ou ["comercio"] e NUNCA como oficina, mecânica ou conserto.
5. MÚLTIPLOS PEDIDOS: Se o usuário pedir mais de uma coisa na mesma frase, separe em termos diferentes no array.
6. PIADAS/SARCASMO/PERGUNTAS IMPOSSÍVEIS: Se o usuário fizer uma piada ou pedir algo contraditório (ex: barbearia para careca, óptica para cego, geladeira para esquimó, churrascaria vegana), mude a propriedade "piada" para true e crie uma resposta sarcástica na propriedade "respostaPiada". Além disso, se o termo real NÃO fizer sentido ser listado (como procurar carne em restaurante vegano), deixe o array "termos" VAZIO: {"termos": [], ...}.
7. VESTUÁRIO E ACESSÓRIOS ESPECÍFICOS: Se o usuário buscar por itens específicos de moda como "chapéu", "bota", "calçado", "salto alto", "roupa de festa", generalize para termos comerciais que o mapa encontre, como ["loja de roupas"], ["calcados"] ou ["boutique"].
8. FILTRO DE CIDADE RÍGIDO: A cidade padrão é SEMPRE Sarandi - RS (Rio Grande do Sul). Se o usuário disser apenas "Sarandi", force a propriedade "cidade" para "Sarandi - RS" para evitar que o mapa busque em Sarandi - PR.
9. Humor e Sarcasmo: Seja muito bem-humorado. Ria da piada do usuário e ofereça o comércio real logo em seguida de forma amigável.
10. Indicações: Se o usuário usar palavras como "me indica", "qual você recomenda?", "qual o melhor?", adicione uma propriedade no JSON de retorno chamada "pedeIndicao": true.

Responda APENAS COM JSON válido, sem explicações:
{
"termos": ["termo1"],
"cidade": "cidade ou null",
"pedeIndicao": true ou false,
"piada": true ou false,
"respostaPiada": "Sua resposta engraçada aqui ou null"
}

Exemplos:
"quero pizza hoje" -> {"termos":["pizzaria"],"cidade":"Sarandi - RS","pedeIndicao":false}
"onde compro um chapeu ou bota por aqui?" -> {"termos":["loja de roupas","calcados"],"cidade":"Sarandi - RS","pedeIndicao":false}
"trator pra comprar" -> {"termos":["concessionaria"],"cidade":"Sarandi - RS","pedeIndicao":false}
"preciso de remédio em sarandi" -> {"termos":["farmacia"],"cidade":"Sarandi - RS","pedeIndicao":false}
"qual o melhor mercado por aqui?" -> {"termos":["mercado"],"cidade":"Sarandi - RS","pedeIndicao":true}
"quero uma churrascaria vegana" -> {"termos":[],"cidade":null,"pedeIndicao":false,"piada":true,"respostaPiada":"Churrascaria vegana? Essa é boa! Acho que o churrasqueiro ia rodar um espeto de alface! Hahaha 🌱 Olha, por aqui ainda não temos essa raridade, mas se quiser outra culinária é só pedir!"}

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

        if (!texto) return { termos: [], cidade: null };

        texto = texto.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(texto);

        // 💊 CONTRA-REGRA: Se o usuário digitou farmácia/remédio, impede o falso positivo de drogas
        const textoOriginal = mensagem?.toLowerCase() || "";
        if (textoOriginal.includes("farmacia") || textoOriginal.includes("farmácia") || textoOriginal.includes("remedio") || textoOriginal.includes("remédio")) {
            if (parsed.termos && parsed.termos.includes("ajuda_saude")) {
                console.log("🩹 Falso positivo de saúde corrigido para busca de Farmácia.");
                parsed.termos = ["farmacia"];
            }
        }
        
        // 1. Substâncias (Acolhimento)
        if (parsed.termos && parsed.termos.includes("ajuda_saude")) {
            console.log("🚨 Alerta de saúde/substâncias acionado.");
            return { 
                erro: `Olha, eu sou apenas um assistente virtual de buscas locais, mas se você ou alguém que você conhece está passando por momentos difíceis com o uso de substâncias, saiba que existe apoio gratuito e sigiloso disponível. ❤️\n\n` +
                      `Você pode ligar para o **Viva Voz** pelo número **132** (orientação e apoio sobre drogas) ou procurar o **CAPS (Centro de Atenção Psicossocial)** aqui na região. Se cuida! 🙏✨`
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
        return { termos: [], cidade: null };
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
- Tem senso de humor e faz piadas ou tira sarro saudável quando o usuário brinca (ex: barbearia para carecas)

COMO VOCÊ AJUDA:
- Quando souber o que o usuário quer, diga: "Digite [nome do lugar] que eu busco pra você! 🔍"
- Se mencionar farmácia, remédio ou dor: "Digite farmácia que eu busco pra você! 💊"
- Se mencionar fome ou comida: APENAS pergunte o que quer comer. NUNCA sugira nomes de alimentos, categorias ou lugares.
- Se mencionar posto ou combustível: "Digite posto que eu busco pra você! ⛽"
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

        for (const e of patrocinadores) {
            const estrelas = e.estrelas ? '⭐'.repeat(e.estrelas) + ' ' : '';
            lista += `💎 ${estrelas}${e.nome}\n`;
            lista += `📞 ${e.telefone || 'não informado'}\n`;
            lista += `📍 ${e.endereco || 'Sarandi'}\n`;
            if (e.horario && e.horario !== 'Fechado') lista += `🕐 Horário: ${e.horario}\n`;
            lista += e.aberto ? `🟢 Aberto agora\n` : `🔴 Fechado no momento\n`;
            lista += `➖➖➖➖➖➖➖➖\n\n`;
        }

        if (demais.length > 0) {
            lista += `➖➖ Outras opções do Mapa ➖➖\n\n`;
            for (const e of demais) {
                lista += `📌 ${e.nome}\n`;
                lista += `📞 ${e.telefone || 'não informado'}\n`;
                lista += `📍 ${e.endereco || 'Sarandi'}\n`;
                if (e.horario && e.horario !== 'Fechado') lista += `🕐 Horário: ${e.horario}\n`;
                lista += e.aberto ? `🟢 Aberto agora\n` : `🔴 Fechado no momento\n`;
                lista += `➖➖➖➖➖➖➖➖➖\n\n`;
            }
        }

        let abertura = introducaoPersonalizada;
        let encerramento = 'Se precisar de mais alguma coisa é só chamar! 🚀';

        if (!abertura) {
            const respostaGemini = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
                {
                    systemInstruction: {
                        parts: [{ text: `Você é o Jayci, assistente animado da JCI Sarandi! 🎉
Gere APENAS uma frase curtíssima (máximo 10 palavras) de abertura animada e uma frase curtíssima de encerramento.
Use emojis. Seja criativo e varie sempre. Nunca repita a mesma frase.
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
                        maxOutputTokens: 60
                    }
                },
                { headers: { 'Content-Type': 'application/json' } }
            );

            const textoGemini = respostaGemini.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const linhas = textoGemini.split('\n').map(l => l.trim()).filter(Boolean);
            const aberturaLinha = linhas.find(l => l.startsWith('ABERTURA:'));
            const encerramentoLinha = linhas.find(l => l.startsWith('ENCERRAMENTO:')); // Fixo: alterado de "lines" para "linhas"
            abertura = aberturaLinha?.replace('ABERTURA:', '').trim() || '🔍 Encontrei essas opções pra você!';
            encerramento = encerramentoLinha?.replace('ENCERRAMENTO:', '').trim() || 'Se precisar de mais alguma coisa é só chamar! 🚀';
        }

        return `${abertura}\n\n${lista}${encerramento}`;

    } catch (err) {
        console.log('Erro RAG:', err.message);
        return null;
    }
}

async function processarMensagem(telefone, mensagem) {
    const texto = String(mensagem).toLowerCase().trim();

    // 🩹 TRAVA DE SEGURANÇA MÁXIMA PARA FARMÁCIA (Evita falso positivo no filtro de 'droga')
    const ehBuscaDeFarmacia = texto.includes('farmacia') || texto.includes('farmácia') || texto.includes('remedio') || texto.includes('remédio') || texto.includes('drogaria');

    // 1. Filtros manuais básicos de segurança antes da IA (Só rodam se NÃO for farmácia)
    if (!ehBuscaDeFarmacia) {
        const termosIlegais = ['droga', 'cocaina', 'cocaína', 'maconha', 'crack', 'heroina', 'heroína', 'traficante', 'arma', 'pistola', 'revolver', 'fuzil', 'explosivo', 'assassino', 'matar'];
        const termosAdultos = ['prostituta', 'prostituição', 'programa', 'michê', 'garota de programa', 'garoto de programa', 'acompanhante', 'puteiro', 'bordel', 'sexo pago'];

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
        const coords = mensagem.replace('__localizacao__', '').split(','); // Fixo: alterado de "message" para "mensagem"
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
        estadoOnboarding[telefone] = { passo: 'aguardando_nome' };
        const resposta = `Eaí! 👋🤩 Eu sou a Jeicy, Assistente Virtual da JCI Sarandi!\n\nAntes de começar, me conta: qual é o seu nome? 😊\n\nCaso não queira se identificar, é só digitar *pular* que a gente segue assim mesmo!`;
        await salvarHistorico(telefone, resposta, 'bot');
        return resposta;
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
            delete estadoOnboarding[telefone];
            const resposta = `Que pena${nome !== 'Visitante' ? `, ${nome}` : ''}! 😕 Por enquanto nossa cobertura atende apenas Sarandi, RS. Em breve expandimos pra mais cidades! 🚀`;
            await salvarHistorico(telefone, resposta, 'bot');
            return resposta;
        }

        await salvarUsuario(telefone, nome, 'Sarandi');
        delete estadoOnboarding[telefone];

        const resposta = `Perfeito${nome !== 'Visitante' ? `, ${nome}` : ''}! ✅ Tudo anotado!\n\nAgora é só me dizer o que você precisa em Sarandi que eu busco na hora! 🔍🚀\n\n🛒 Mercado | 🍕 Pizza | 💊 Farmácia\n⛽ Posto | 🍞 Padaria | 💈 Barbearia\n🏦 Banco | 🐾 Petshop | e muito mais...`;
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
    const localizacao = localizacaoUsuario[telefone] || (usuario?.lat ? { lat: usuario.lat, lon: usuario.lon } : null);
    const cidadePadrao = 'Sarandi';

    const historico = await buscarHistorico(telefone);
    const ultimasPesquisas = await buscarUltimasPesquisas(telefone);

    // 4. Chamada de Intenção (Com a nossa trava de ignorar IA para farmácia mantida!)
    let intent;
    if (ehBuscaDeFarmacia) {
        console.log("💊 Busca direta por farmácia/remédio detectada. Ignorando filtros de segurança.");
        intent = {
            termos: ["farmacia"],
            cidade: "Sarandi - RS",
            pedeIndicao: false,
            piada: false
        };
    } else {
        intent = await extrairIntencao(mensagem, historico);
    }

    if (intent.erro) {
        await salvarHistorico(telefone, intent.erro, 'bot');
        return intent.erro;
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
    const termoBusca = intent.termos[0];
    ultimaBusca[telefone] = termoBusca;
    
    const cidadeFinal = intent.cidade ? intent.cidade : cidadePadrao;

    console.log('🧠 TERMO BUSCA:', termoBusca);
    console.log('🏙️ CIDADE:', cidadeFinal);

    await salvarPesquisa(telefone, termoBusca, cidadeFinal);

    const patrocinadores = await buscarPatrocinadores(termoBusca, cidadeFinal);
    console.log('⭐ PATROCINADORES:', patrocinadores.length);
        
    // Configuração do texto de introdução (Piadas, Indicações ou Padrão)
    let mensagemIntroducao = "";
    
    if (intent.piada && intent.respostaPiada) {
        mensagemIntroducao = `${intent.respostaPiada}\n\n`;
    } else if (intent.pedeIndicao && patrocinadores.length > 0) {
        mensagemIntroducao = `Com certeza! 🌟 Separei aqui as minhas melhores indicações em Sarandi para você: \n\n`;
    } else if (intent.pedeIndicao) {
        mensagemIntroducao = `Olha, não tenho nenhum parceiro exclusivo para te indicar de olhos fechados, mas encontrei essas opções no mapa: \n\n`;
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

    let textoFinal = mensagemIntroducao || ""; 

    if (patrocinadores.length > 0) {
        textoFinal += `✨ *Destaques Recomendados:* \n`;
        for (const p of patrocinadores) {
            textoFinal += `⭐ *${p.nome}*\n📍 ${p.endereco}\n📞 ${p.telefone}\n🕒 ${p.horario}\n\n`;
        }
    }

    const empresas = await buscarEmpresas(termoBusca, cidadeFinal);
    console.log('🏪 EMPRESAS SUBAPASE:', empresas?.length || 0);

    if (!empresas || empresas.length === 0) {
        console.log('⚠️ Nada no Supabase, buscando no Google Places...');
        
        const osm = await buscarOSM(termoBusca, cidadeFinal, localizacao);

        if (osm && osm.foraDeCobertura) {
            console.log(`🧭 Cidade fora de cobertura detectada: ${osm.cidadeTentada}`);
            const respostaFora = `Bah, tchê! 🧭 Olhei aqui no mapa e vi que você buscou algo em *${osm.cidadeTentada}*. 🗺️\n\nPor enquanto o meu sistema opera EXCLUSIVAMENTE em Sarandi - RS! 🥹 Segura a ansiedade que logo logo a gente expande fronteiras! 🚀🛑`;
            await salvarHistorico(telefone, respostaFora, 'bot');
            return respostaFora;
        }

        if (osm?.erro) return osm.erro;

        if (!osm || osm.length === 0) {
            const respostaVazia = `❌ Não encontrei nada de "${termoBusca}" em *${cidadeFinal}*.`;
            await salvarHistorico(telefone, respostaVazia, 'bot');
            return respostaVazia;
        }

        const nomesPatrocinadores = patrocinadores.map(p => p.nome.toLowerCase());
        const osmFiltrado = osm.filter(o => {
            const nomeOSM = o.nome.toLowerCase();
            return !nomesPatrocinadores.some(n => nomeOSM === n || nomeOSM.includes(n) || n.includes(nomeOSM));
        });

        const todosOSM = [...patrocinadores.map(p => ({
            ...p,
            aberto: true,
            patrocinador: true
        })), ...osmFiltrado];

        ultimosResultados[telefone] = todosOSM.map(e => e.nome).join(',');
        
        const respostaRAG = await responderComRAG(mensagem, [], todosOSM, nomeUsuario, cidadeFinal, mensagemIntroducao);

        if (respostaRAG) {
            await salvarHistorico(telefone, respostaRAG, 'bot');
            return respostaRAG;
        }

        let respostaOSM = textoFinal + '🌍 Encontrei isso aqui:\n\n';
        osmFiltrado.forEach(e => {
            respostaOSM += `📍 ${e.nome}\n📞 ${e.telefone || 'não informado'}\n📌 ${e.endereco}\n\n`;
        });
        await salvarHistorico(telefone, respostaOSM, 'bot');
        return respostaOSM;
    }

    const todosResultados = [...patrocinadores.map(p => ({
        ...p,
        aberto: true,
        patrocinador: true
    })), ...(empresas || [])];
    
    ultimosResultados[telefone] = todosResultados.map(e => e.nome).join(',');
    const respostaRAG = await responderComRAG(termoBusca, [], todosResultados, nomeUsuario, cidadeFinal, mensagemIntroducao);

    if (respostaRAG) {
        await salvarHistorico(telefone, respostaRAG, 'bot');
        return respostaRAG;
    }

    let respostaFinal = textoFinal + '🏢 Achei isso pra você:\n\n';
    empresas.forEach(e => {
        const destaque = e.patrocinador ? '⭐ ' : '';
        respostaFinal += `${destaque}${e.nome} - ${e.telefone || 'Sem fone'} - ${e.endereco || 'Sarandi'}\n`;
    });

    await salvarHistorico(telefone, respostaFinal, 'bot');
    return respostaFinal;
}

module.exports = { processarMensagem };