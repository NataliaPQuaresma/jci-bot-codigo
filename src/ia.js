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
Sua função é identificar O QUE o usuário está procurando.
IMPORTANTE: Se a mensagem for uma piada, humor, sarcasmo ou pergunta claramente impossível, retorne termos como array vazio.
Responda APENAS COM JSON válido, sem explicações:
{
"termos": ["termo1", "termo2"],
"cidade": "cidade mencionada ou null"
}
Se houver apenas um pedido: {"termos": ["pizzaria"], "cidade": null}
Se não houver pedido: {"termos": [], "cidade": null}
Exemplos:
"quero pizza hoje" -> {"termos":["pizzaria"],"cidade":null}
"preciso de pao leite e remedio" -> {"termos":["padaria","mercado","farmacia"],"cidade":null}
"quero pizza e uma cerveja" -> {"termos":["pizzaria","bar"],"cidade":null}
"preciso de remédio em sarandi" -> {"termos":["farmacia"],"cidade":"sarandi"}
"tô com fome" -> {"termos":["restaurante"],"cidade":null}
"to com uma fome de leao" -> {"termos":["restaurante"],"cidade":null}
"preciso comer alguma coisa" -> {"termos":["restaurante"],"cidade":null}
"o que vc me indica hoje?" -> {"termos":[],"cidade":null}
"sushi" -> {"termos":["sushi"],"cidade":null}
"tem barbearia pra carecas?" -> {"termos":["barbearia"],"cidade":null}
"oi" -> {"termos":[],"cidade":null}
"como vai?" -> {"termos":[],"cidade":null}
"preciso treinar coxas hoje" -> {"termos":["academia"],"cidade":null}
"quero malhar" -> {"termos":["academia"],"cidade":null}
"preciso cortar o cabelo" -> {"termos":["barbearia"],"cidade":null}
"tô precisando de um médico" -> {"termos":["hospital"],"cidade":null}
"meu carro tá sem gasolina" -> {"termos":["posto"],"cidade":null}
"preciso tirar dinheiro" -> {"termos":["banco"],"cidade":null}
"quero sacar dinheiro" -> {"termos":["banco"],"cidade":null}
"to precisando de grana" -> {"termos":["banco"],"cidade":null}
"minha cabeça ta doendo" -> {"termos":["farmacia"],"cidade":null}
"preciso de um remedinho" -> {"termos":["farmacia"],"cidade":null}
"to com dor de dente" -> {"termos":["dentista"],"cidade":null}
"quero tomar uma cerveja" -> {"termos":["bar"],"cidade":null}
"quero um docinho" -> {"termos":["sorveteria"],"cidade":null}
"preciso levar meu pet no vet" -> {"termos":["petshop"],"cidade":null}
"meu cachorro ta doente" -> {"termos":["petshop"],"cidade":null}
"preciso de ração pro meu gato" -> {"termos":["petshop"],"cidade":null}
"quero comprar roupa" -> {"termos":["loja de roupas"],"cidade":null}
"preciso abastecer" -> {"termos":["posto"],"cidade":null}
"to precisando de um advogado" -> {"termos":["advocacia"],"cidade":null}
"preciso regularizar minha empresa" -> {"termos":["contabilidade"],"cidade":null}
"quero alugar uma casa" -> {"termos":["imobiliaria"],"cidade":null}
"preciso de um hotel pra ficar" -> {"termos":["hotel"],"cidade":null}
"quero fazer as unhas" -> {"termos":["salao"],"cidade":null}
"preciso pintar o cabelo" -> {"termos":["salao"],"cidade":null}
"to com febre" -> {"termos":["farmacia"],"cidade":null}
"preciso de um medico urgente" -> {"termos":["hospital"],"cidade":null}
"quero tomar um sorvete" -> {"termos":["sorveteria"],"cidade":null}
"preciso de cafe" -> {"termos":["padaria"],"cidade":null}
"quero um lanche rapido" -> {"termos":["lanchonete"],"cidade":null}
"to com sede" -> {"termos":[],"cidade":null}
"boa noite" -> {"termos":[],"cidade":null}
"que horas sao" -> {"termos":[],"cidade":null}
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
                    maxOutputTokens: 500
                }
            },
            {
                headers: { 'Content-Type': 'application/json' }
            }
        );
        let texto = resposta.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log("RAW IA:", texto);

        if (!texto) return { termos: [], cidade: null };

        texto = texto.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(texto);

        if (parsed.termoBusca !== undefined) {
            return {  termos: parsed.termoBusca ? [parsed.termoBusca] : [], cidade: parsed.cidade };   
        }
        return { termos: parsed.termos || [], cidade: parsed.cidade };
    } catch (err) {
        console.log("erro extrairIntencao", err.message);
        console.log("detalhes:", JSON.stringify(err.response?.data));
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
- Tem senso de humor e faz piadas quando o usuário brinca

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
    const hora = new Date().toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit'
    });

    try {
        const patrocinadores = empresas.filter(e => e.patrocinador);
        const demais = empresas.filter(e => !e.patrocinador);

        let lista = '';

        for (const e of patrocinadores) {
            const estrelas = e.estrelas ? '⭐'.repeat(e.estrelas) + ' ' : '';
            lista += `💎 ${estrelas}${e.nome}\n`;
            lista += `📞 ${e.telefone || 'não informado'}\n`;
            lista += `📍 ${e.endereco || 'Sarandi'}\n`;
            if (e.horario) lista += `🕐 Horário: ${e.horario}\n`;
            lista += e.aberto ? `🟢 Aberto agora\n` : `🔴 Fechado no momento\n`;
            lista += `➖➖➖➖➖➖➖➖➖➖\n\n`;
        }

        if (demais.length > 0) {
            lista += `➖➖➖ Outras opções ➖➖➖\n\n`;
            for (const e of demais) {
                lista += `📌 ${e.nome}\n`;
                lista += `📞 ${e.telefone || 'não informado'}\n`;
                lista += `📍 ${e.endereco || 'Sarandi'}\n`;
                if (e.horario && e.horario !== 'Fechado') lista += `🕐 Horário: ${e.horario}\n`;
                lista += e.aberto ? `🟢 Aberto agora\n` : `🔴 Fechado no momento\n`;
                lista += `➖➖➖➖➖➖➖➖➖➖\n\n`;
            }
        }

        const resposta = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                systemInstruction: {
                    parts: [{ text: `Você é o Jayci, assistente animado da JCI Sarandi! 🎉
Gere APENAS uma frase curta e animada de abertura (máximo 1 linha) e uma frase curta de encerramento.
Nada mais. Sem listas, sem dados, sem emojis de estabelecimentos.
Horário atual: ${hora}
NUNCA use asteriscos ou markdown.` }]
                },
                contents: [{
                    role: 'user',
                    parts: [{ text: `Gere uma frase de abertura animada para resultados de busca por "${mensagem}" e uma frase de encerramento. Responda no formato:\nABERTURA: [frase]\nENCERRAMENTO: [frase]` }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 200
                }
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        const texto = resposta.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const abertura = texto.match(/ABERTURA:\s*(.+)/)?.[1]?.trim() || 'Encontrei essas opções pra você! 🔍';
        const encerramento = texto.match(/ENCERRAMENTO:\s*(.+)/)?.[1]?.trim() || 'Se precisar de mais alguma coisa é só chamar! 🚀';
        
        if (!abertura || abertura.length < 3) {
            return `🔍 Encontrei essas opções pra você!\n\n${lista}Se precisar de mais alguma coisa é só chamar! 🚀;`
        }
        return `${abertura}\n\n${lista}${encerramento}`;

    } catch (err) {
        console.log('Erro RAG:', err.message);
        return null;
    }
}


async function processarMensagem(telefone, mensagem) {

    const texto = String(mensagem).toLowerCase().trim();

    // detecta pedidos ilegais
    const termosIlegais = [
        'droga', 'cocaina', 'cocaína', 'maconha', 'crack', 'heroina', 'heroína',
        'traficante', 'arma', 'pistola', 'revolver', 'fuzil', 'explosivo', 'assassino', 'matar'
    ];

    const termosAdultos = [
        'prostituta', 'prostituição', 'programa', 'michê', 'garota de programa',
        'garoto de programa', 'acompanhante', 'puteiro', 'bordel', 'sexo pago'
    ];

    if (termosIlegais.some(t => texto.includes(t))) {
        const resposta = `Opa, esse tipo de coisa não posso te ajudar a encontrar! 😅\n\nMas se você estiver passando por um momento difícil, o CVV atende 24h pelo número *188* ou pelo site cvv.org.br 💙\n\nSe quiser buscar outra coisa em Sarandi, é só me dizer! 🔍`;
        await salvarHistorico(telefone, resposta, 'bot');
        return resposta;
    }

    if (termosAdultos.some(t => texto.includes(t))) {
        const resposta = `Hmm, esse tipo de serviço não é algo que eu possa te ajudar a encontrar! 😅\n\nMas se precisar de qualquer outra coisa em Sarandi, tô aqui pra ajudar! 🔍🚀`;
        await salvarHistorico(telefone, resposta, 'bot');
        return resposta;
    }

    // verifica se é localização
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

    // verifica se é usuário novo
    const usuarioExistente = await buscarUsuario(telefone);

    if (!usuarioExistente && !estadoOnboarding[telefone]) {
        estadoOnboarding[telefone] = { passo: 'aguardando_nome' };

        const resposta = `Eaí! 👋🤩 Eu sou a Jeicy, Assistente Virtual da JCI Sarandi!

Antes de começar, me conta: qual é o seu nome? 😊

Caso não queira se identificar, é só digitar *pular* que a gente segue assim mesmo!`;

        await salvarHistorico(telefone, resposta, 'bot');
        return resposta;
    }

    // ETAPA 1 — nome
    if (estadoOnboarding[telefone]?.passo === 'aguardando_nome') {
        const nomeRecebido = mensagem.trim();

        const naoQuerIdentificar = ['não', 'nao', 'pular', 'pula', 'skip', 'anonimo',
            'anônimo', 'tanto faz', 'sem nome', 'prefiro nao', 'prefiro não'].some(p =>
            nomeRecebido.toLowerCase().includes(p)
        );

        const nomeFinal = naoQuerIdentificar ? 'Visitante' : nomeRecebido;

        estadoOnboarding[telefone] = {
            passo: 'aguardando_confirmacao_cidade',
            nome: nomeFinal
        };

        const resposta = naoQuerIdentificar
            ? `Tudo bem, sem problemas! 😊\n\nVocê é de Sarandi, RS?\n\nDigite *sim* para continuar ou *não* caso seja de outra cidade!`
            : `Prazer, ${nomeFinal}! 🙌\n\nVocê é de Sarandi, RS?\n\nDigite *sim* para continuar ou *não* caso seja de outra cidade!`;

        await salvarHistorico(telefone, resposta, 'bot');
        return resposta;
    }

    // ETAPA 2 — confirmação cidade
    if (estadoOnboarding[telefone]?.passo === 'aguardando_confirmacao_cidade') {
        const nome = estadoOnboarding[telefone].nome;
        const respostaUsuario = mensagem.trim().toLowerCase();

        const confirmou = ['sim', 's', 'yes', 'claro', 'isso', 'é', 'sou', 'confirmo', 'yep', 'com certeza'].some(p =>
            respostaUsuario.includes(p)
        );

        if (!confirmou) {
            delete estadoOnboarding[telefone];
            const resposta = `Que pena${nome !== 'Visitante' ? `, ${nome}` : ''}! 😕 Por enquanto nossa cobertura atende apenas Sarandi, RS. Em breve expandimos pra mais cidades! 🚀`;
            await salvarHistorico(telefone, resposta, 'bot');
            return resposta;
        }

        await salvarUsuario(telefone, nome, 'Sarandi');
        delete estadoOnboarding[telefone];

        const resposta = `Perfeito${nome !== 'Visitante' ? `, ${nome}` : ''}! ✅ Tudo anotado!

Agora é só me dizer o que você precisa em Sarandi que eu busco na hora! 🔍🚀

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
    const localizacao = localizacaoUsuario[telefone]
        || (usuario?.lat ? { lat: usuario.lat, lon: usuario.lon } : null);
    const cidade = 'Sarandi';

    const historico = await buscarHistorico(telefone);
    const ultimasPesquisas = await buscarUltimasPesquisas(telefone);

    const intent = await extrairIntencao(mensagem, historico);

    // detecta perguntas sobre resultados anteriores
    const perguntasSobreResultados = [
        'nesses', 'nesse', 'neles', 'nelas', 'deles', 'delas',
        'posso ir', 'posso sacar', 'eles aceitam', 'qual é melhor',
        'qual deles', 'me indica', 'me recomenda', 'qual você indica'
    ].some(p => texto.includes(p));

    if (perguntasSobreResultados && ultimosResultados[telefone]) {
        const respostaIA = await conversarComIA(
            mensagem, historico, nomeUsuario, cidadeUsuario, ultimasPesquisas, false
        );
        await salvarHistorico(telefone, respostaIA, 'bot');
        return respostaIA;
    }

    const pedindoMais = ['mais', 'tem mais', 'outras opções', 'outras opcoes', 'mais opcoes', 'mais opções', 'outros', 'tem mais opção', 'tem mais opcao'].some(p => texto.includes(p));
    if (pedindoMais && ultimaBusca[telefone]) {
        if (ultimosResultados[telefone]) {
            const respostaMais = 'Essas são todas as opções que encontrei por aqui! 😊 Se precisar de outra categoria é só me dizer! 🔍';
            await salvarHistorico(telefone, respostaMais, 'bot');
            return respostaMais;
        }
        intent.termos = [ultimaBusca[telefone]];
    } else if (!intent?.termos || intent.termos.length === 0) {
        const primeiraInteracao = historico.length <= 2;
        const respostaIA = await conversarComIA(
            mensagem, historico, nomeUsuario, cidadeUsuario, ultimasPesquisas, primeiraInteracao
        );
        await salvarHistorico(telefone, respostaIA, 'bot');
        return respostaIA;
    }

    // múltiplos pedidos
    if (intent.termos.length > 1) {
        let respostaFinal = '';
        for (const termo of intent.termos) {
            await salvarPesquisa(telefone, termo, cidade);
            const pats = await buscarPatrocinadores(termo, cidade);
            for (const p of pats) {
                const dados = await buscarDadosPatrocinador(p.nome);
                if (dados) {
                    p.endereco = p.endereco || dados.endereco;
                    p.telefone = p.telefone || dados.telefone;
                    p.aberto = dados.aberto;
                    p.horario = dados.horario;
                }
            }
            const emps = await buscarEmpresas(termo, cidade);
            let resultados = [];
            if (!emps || emps.length === 0) {
                const osm = await buscarOSM(termo, cidade, localizacao);
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
                const rag = await responderComRAG(termo, [], resultados, nomeUsuario, cidade);
                if (rag) respostaFinal += rag + '\n\n';
            } else {
                respostaFinal += `❌ Não encontrei nada de "${termo}" em ${cidade}.\n\n`;
            }
        }
        await salvarHistorico(telefone, respostaFinal.trim(), 'bot');
        return respostaFinal.trim();
    }

    // pedido único
    const termoBusca = intent.termos[0];
    ultimaBusca[telefone] = termoBusca;

    console.log('🧠 TERMO BUSCA:', termoBusca);
    console.log('🏙️ CIDADE:', cidade);

    await salvarPesquisa(telefone, termoBusca, cidade);

    const patrocinadores = await buscarPatrocinadores(termoBusca, cidade);
    console.log('⭐ PATROCINADORES:', patrocinadores.length);

    for (const p of patrocinadores) {
        const dados = await buscarDadosPatrocinador(p.nome);
        console.log('📍 DADOS PATROCINADOR:', p.nome, dados);
        if (dados) {
            p.endereco = p.endereco || dados.endereco;
            p.telefone = p.telefone || dados.telefone;
            p.aberto = dados.aberto;
            p.horario = dados.horario;
        }
    }

    const empresas = await buscarEmpresas(termoBusca, cidade);
    console.log('🏪 EMPRESAS:', empresas);

    if (!empresas || empresas.length === 0) {
        console.log('⚠️ Nada no Supabase, buscando no Google Places...');

        const osm = await buscarOSM(termoBusca, cidade, localizacao);

        if (osm?.erro) return osm.erro;

        if (!osm || osm.length === 0) {
            return `❌ Não encontrei nada de "${termoBusca}" em ${cidade}.`;
        }

        const nomesPatrocinadores = patrocinadores.map(p => p.nome.toLowerCase());
        const osmFiltrado = osm.filter(o => {
            const nomeOSM = o.nome.toLowerCase();
            return !nomesPatrocinadores.some(n =>
                nomeOSM === n ||
                nomeOSM.includes(n) ||
                n.includes(nomeOSM)
            );
        });

        const todosOSM = [...patrocinadores.map(p => ({
            ...p,
            aberto: true,
            patrocinador: true
        })), ...osmFiltrado];

        console.log('🔍 OSM FILTRADO:', osmFiltrado.map(e => e.nome));
        console.log('📦 TODOS OSM:', todosOSM.map(e => e.nome));

        ultimosResultados[telefone] = todosOSM.map(e => e.nome).join(',');

        const respostaRAG = await responderComRAG(mensagem, [], todosOSM, nomeUsuario, cidade);

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
        patrocinador: true
    })), ...(empresas || [])];
    ultimosResultados[telefone] = todosResultados.map(e => e.nome).join(',');

    const respostaRAG = await responderComRAG(termoBusca, [], todosResultados, nomeUsuario, cidade);

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