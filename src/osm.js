require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');

// CATEGORIAS
const CATEGORIAS = {
    mercado: {
        sinonimos: ['mercado', 'supermercado', 'mercadinho', 'mercearia', 'minimercado'],
        tipo: 'supermarket'
    },
    farmacia: {
        sinonimos: ['farmácia', 'farmacia', 'drogaria', 'remédio', 'remedio'],
        tipo: 'pharmacy'
    },
    postosaude: {
        sinonimos: ['posto de saude', 'posto de saúde', 'unidade de saude', 'unidade de saúde', 'ubs', 'usf', 'unidade basica'],
        tipo: 'hospital'
    },
    posto: {
        sinonimos: ['posto', 'combustível', 'combustivel', 'gasolina', 'etanol'],
        tipo: 'gas_station'
    },
    padaria: {
        sinonimos: ['padaria', 'pão', 'pao', 'panificadora'],
        tipo: 'bakery'
    },
    pizzaria: {
        sinonimos: ['pizza', 'pizzaria'],
        tipo: 'pizza_restaurant'
    },
    restaurante: {
        sinonimos: ['restaurante', 'lanchonete', 'lanche', 'comida', 'refeição', 'refeicao', 'hamburguer'],
        tipo: 'restaurant'
    },
    banco: {
        sinonimos: ['banco', 'caixa eletrônico', 'caixa eletronico', 'atm', 'lotérica', 'loterica'],
        tipo: 'bank'
    },
    hospital: {
        sinonimos: ['hospital', 'clínica', 'clinica', 'upa', 'pronto socorro', 'médico', 'medico'],
        tipo: 'hospital'
    },
    escola: {
        sinonimos: ['escola', 'colégio', 'colegio', 'ensino'],
        tipo: 'school'
    },
    roupas: {
        sinonimos: ['roupa', 'roupas', 'loja de roupa', 'loja de roupas', 'vestuario', 'vestuário', 'moda', 'roupa de festa', 'roupa social', 'festa'],
        tipo: 'clothing_store'
    },
    calcados: {
        sinonimos: ['calçado', 'calcado', 'sapato', 'tênis', 'tenis', 'sapataria', 'bota', 'sandalia', 'sandália', 'sapatilha'],
        tipo: 'shoe_store'
    },
    barbearia: {
        sinonimos: ['barbearia', 'barbeiro'],
        tipo: 'barber_shop'
    },
    igreja: {
        sinonimos: ['igreja', 'culto', 'missa', 'templo'],
        tipo: 'church'
    },
    contabilidade: {
        sinonimos: ['contabilidade', 'contador', 'contadora', 'contabil', 'contábil'],
        tipo: 'accounting'
    },
    advocacia: {
        sinonimos: ['advogado', 'advogada', 'advocacia', 'juridico', 'jurídico', 'adevogado'],
        tipo: 'lawyer'
    },
    imobiliaria: {
        sinonimos: ['imobiliaria', 'imobiliária', 'imóvel', 'imovel', 'aluguel', 'compra de casa'],
        tipo: 'real_estate_agency'
    },
    petshop: {
        sinonimos: ['petshop', 'pet shop', 'pet', 'animais', 'remedio animal', 'remédio animal', 'racao', 'ração'],
        tipo: 'pet_store'
    },
    lojaInfantil: {
        sinonimos: ['loja de roupa infantil', 'roupa de crianca', 'roupa de criança', 'roupa infantil', 'loja infantil'],
        tipo: 'clothing_store'
    },
    bar: {
        sinonimos: ['bar', 'cerveja', 'bebida', 'boteco', 'barzinho', 'encher a cara', 'tomar uma'],
        tipo: 'bar'
    },
    sorvete: {
        sinonimos: ['sorvete', 'sorveteria', 'gelato'],
        tipo: 'ice_cream_shop'
    },
    academia: {
        sinonimos: ['academia', 'gym', 'musculação', 'musculacao', 'crossfit'],
        tipo: 'gym'
    },
    hotel: {
        sinonimos: ['hotel', 'pousada', 'hospedagem', 'hostel'],
        tipo: 'hotel'
    },
    salaobeleza: {
        sinonimos: ['salão', 'salao', 'cabeleireiro', 'cabeleireira', 'manicure', 'estética', 'estetica'],
        tipo: 'beauty_salon'
    },
    dentista: {
        sinonimos: ['dentista', 'odontologia', 'odonto', 'dente'],
        tipo: 'dentist'
    },
    concessionaria: {
        sinonimos: ['carro antigo', 'landau', 'concessionaria', 'concessionária', 'comprar carro', 'automovel', 'automóvel'],
        tipo: 'car_dealer'
    }
};

const COORDS_CIDADES = {
    'sarandi': { lat: -27.9378, lon: -52.9167 },
};

const palavrasAnimal = ['pet', 'animal', 'veterinár', 'veterinar', 'agropecuária', 'agropecuaria'];

// REMOVE ACENTOS PARA COMPARAÇÃO
function removerAcentos(str) {
    return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Força o fuso horário de Brasília e ajusta a array do Google (Seg=0 ... Dom=6)
function obterIndiceDiaGoogle() {
    const dataLocal = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const diaSemanaJS = dataLocal.getDay(); // Dom = 0, Seg = 1, ... Sab = 6
    const mapeamentoGoogle = [6, 0, 1, 2, 3, 4, 5]; 
    return mapeamentoGoogle[diaSemanaJS];
}

// CONVERTE COORDENADAS EM NOME DE CIDADE
async function obterCidadePorCoordenadas(lat, lon) {
    try {
        const resposta = await axios.get(
            'https://maps.googleapis.com/maps/api/geocode/json',
            {
                params: {
                    latlng: `${lat},${lon}`,
                    key: process.env.GOOGLE_PLACES_KEY,
                    language: 'pt-BR',
                }
            }
        );

        console.log('🗺️ GEOCODING STATUS:', resposta.data?.status);

        const resultados = resposta.data?.results;
        if (!resultados || resultados.length === 0) return null;

        const componentes = resultados[0]?.address_components || [];
        console.log('🗺️ COMPONENTES:', JSON.stringify(componentes));

        const cidade = componentes.find(c => c.types.includes('locality'))?.long_name
            || componentes.find(c => c.types.includes('administrative_area_level_2'))?.long_name;

        const estado = componentes.find(c => c.types.includes('administrative_area_level_1'))?.short_name;

        if (!cidade) return null;

        return estado ? `${cidade}, ${estado}` : cidade;

    } catch (err) {
        console.log('Erro geocoding:', err.message);
        return null;
    }
}

// DETECTA CATEGORIA DA BUSCA (com suporte a acentos e erros de digitação)
function detectarCategoria(query) {
    const queryNorm = removerAcentos(query || '');
    for (const [, dados] of Object.entries(CATEGORIAS)) {
        if (dados.sinonimos.some(sin => {
            const sinNorm = removerAcentos(sin);
            const escaped = sinNorm.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
            const regex = new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'i');
            return regex.test(queryNorm);
        })) {
            return dados.tipo;
        }
    }
    return null;
}

// NORMALIZA NOME DE CIDADE
function normalizarCidade(cidade) {
    return (cidade || '')
        .replace(/\s*-\s*RS\s*$/i, '')   // remove " - RS"
        .replace(/,\s*RS\s*$/i, '')        // remove ", RS"
        .replace(/\s+RS\s*$/i, '')         // remove " RS" solto no final
        .trim()
        .toLowerCase();
}

// BUSCA NO GOOGLE PLACES
async function buscarOSM(query, cidade, localizacao = null) {
    try {
        console.log('🔎 buscarOSM chamado:', query, cidade, localizacao);
        console.log("🔑 CHAVE:", process.env.GOOGLE_PLACES_KEY ? "carregada" : "VAZIA");

        const cidadeNormalizada = normalizarCidade(cidade);

        let coords;
        if (localizacao) {
            coords = { lat: localizacao.lat, lon: localizacao.lon };
            console.log('📍 Usando coordenadas GPS reais:', coords);
        } else {
            coords = COORDS_CIDADES[cidadeNormalizada];
            console.log('📍 Usando coordenadas da cidade:', cidadeNormalizada, coords);
        }

        if (!coords) {
            return {
                foraDeCobertura: true,
                cidadeTentada: cidade,
                erro: `Não encontrei a cidade *${cidade}*. Por enquanto atendo: ${Object.keys(COORDS_CIDADES).join(', ')}.`
            };
        }

        const tipo = detectarCategoria(query);
        console.log('🏷️ TIPO DETECTADO:', tipo, '| QUERY:', query);

        // Busca específica para roupa infantil
        
if (query.includes('infantil') || query.includes('crianca') || query.includes('criança')) {
    const respostaInfantil = await axios.post(
        'https://places.googleapis.com/v1/places:searchText',
        {
            textQuery: `loja roupa infantil ${cidade} RS Brasil`,
            maxResultCount: 10,
            languageCode: 'pt-BR',
            locationBias: {
                circle: {
                    center: { latitude: coords.lat, longitude: coords.lon },
                    radius: 5000
                }
            }
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': process.env.GOOGLE_PLACES_KEY,
                'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.businessStatus,places.currentOpeningHours'
            }
        }
    );

    const diaIndex = obterIndiceDiaGoogle();
    const lugaresInfantil = respostaInfantil.data?.places || [];
    console.log('👶 Lugares infantil encontrados:', lugaresInfantil.length);

    return lugaresInfantil
        .filter(p => p.businessStatus === 'OPERATIONAL')
        .map(p => ({
            nome: p.displayName?.text || 'Sem nome',
            endereco: p.formattedAddress || cidade,
            telefone: p.nationalPhoneNumber || '',
            aberto: p.currentOpeningHours?.openNow === true,
            horario: (p.currentOpeningHours?.weekdayDescriptions?.[diaIndex] || '').replace(/^[^:]+:\s*/, '')
        }));
}
        if (!tipo) {
            const respostaTexto = await axios.post(
                'https://places.googleapis.com/v1/places:searchText',
                {
                    textQuery: `${query} em ${cidade} RS Brasil`,
                    maxResultCount: 10,
                    languageCode: 'pt-BR',
                    locationBias: {
                        circle: {
                            center: {
                                latitude: coords.lat,
                                longitude: coords.lon
                            },
                            radius: 5000
                        }
                    }
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_KEY,
                        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.businessStatus,places.currentOpeningHours'
                    }
                }
            );

            const lugaresTexto = respostaTexto.data?.places || [];
            console.log('🔎 Lugares texto encontrados:', lugaresTexto.length);

            if (lugaresTexto.length === 0) {
                return { erro: `Não encontrei nenhum(a) *${query}* em ${cidade} 😕` };
            }

            const diaIndex = obterIndiceDiaGoogle();

            return lugaresTexto
                .filter(p => p.businessStatus === 'OPERATIONAL')
                .map(p => ({
                    nome: p.displayName?.text || 'Sem nome',
                    endereco: p.formattedAddress || cidade,
                    telefone: p.nationalPhoneNumber || '',
                    aberto: p.currentOpeningHours?.openNow === true,
                    horario: (p.currentOpeningHours?.weekdayDescriptions?.[diaIndex] || '').replace(/^[^:]+:\s*/, '')
                }));
        }

        const resposta = await axios.post(
            'https://places.googleapis.com/v1/places:searchNearby',
            {
                includedTypes: [tipo],
                maxResultCount: 10,
                languageCode: 'pt-BR',
                locationRestriction: {
                    circle: {
                        center: {
                            latitude: coords.lat,
                            longitude: coords.lon
                        },
                        radius: 5000
                    }
                }
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': process.env.GOOGLE_PLACES_KEY,
                    'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.businessStatus,places.currentOpeningHours'
                }
            }
        );

        const lugares = resposta.data?.places || [];
        console.log('🔎 Lugares nearby encontrados:', lugares.length);

        if (lugares.length === 0) return [];

        const operacionais = lugares
            .filter(p => p.businessStatus === 'OPERATIONAL')
            .filter(p => {
                if (tipo !== 'pharmacy') return true;
                const nome = p.displayName?.text?.toLowerCase() || '';
                return !palavrasAnimal.some(palavra => nome.includes(palavra));
            });

        let listaFinal = operacionais;

        if (tipo === 'bank') {
            const respostaCoops = await axios.post(
                'https://places.googleapis.com/v1/places:searchText',
                {
                    textQuery: `cooperativa de credito ${cidadeNormalizada} RS`,
                    maxResultCount: 5,
                    languageCode: 'pt-BR',
                    locationBias: {
                        circle: {
                            center: { latitude: coords.lat, longitude: coords.lon },
                            radius: 8000
                        }
                    }
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_KEY,
                        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.businessStatus,places.currentOpeningHours'
                    }
                }
            );

            const diaIndexCoop = obterIndiceDiaGoogle();

            const coops = (respostaCoops.data?.places || [])
                .filter(p => p.businessStatus === 'OPERATIONAL')
                .map(p => ({
                    nome: p.displayName?.text || 'Sem nome',
                    endereco: p.formattedAddress || cidadeNormalizada,
                    telefone: p.nationalPhoneNumber || '',
                    aberto: p.currentOpeningHours?.openNow === true,
                    horario: (p.currentOpeningHours?.weekdayDescriptions?.[diaIndexCoop] || '').replace(/^[^:]+:\s*/, '')
                }));

            const nomesExistentes = listaFinal.map(e =>
                (e.nome || e.displayName?.text || '').toLowerCase()
            );
            const coopsFiltradas = coops.filter(c => {
                if (!c.nome) return false;
                const nomeC = c.nome.toLowerCase();
                return !nomesExistentes.some(n => n.includes(nomeC) || nomeC.includes(n));
            });

            listaFinal = [...listaFinal, ...coopsFiltradas];
            console.log('🏦 COOPERATIVAS encontradas:', coopsFiltradas.map(c => c.nome));
        }

        const listaMapeada = listaFinal.map(p => {
            if (p.nome) return p;

            const diaIndex = obterIndiceDiaGoogle();

            const resultado = {
                nome: p.displayName?.text || 'Sem nome',
                endereco: p.formattedAddress || cidadeNormalizada,
                telefone: p.nationalPhoneNumber || '',
                aberto: p.currentOpeningHours?.openNow === true,
                horario: (p.currentOpeningHours?.weekdayDescriptions?.[diaIndex] || '').replace(/^[^:]+:\s*/, '')
            };
            console.log('🏨 LUGAR:', resultado.nome, '| ABERTO:', resultado.aberto, '| HORARIO:', resultado.horario);
            return resultado;
        }).filter(p => p.nome && p.nome !== 'Sem nome');

        const filtrosIrrelevantes = {
            clothing_store: ['hospital', 'clinica', 'clínica', 'instituto', 'escola', 'colégio', 'colegio', 'farmacia', 'farmácia', 'banco', 'posto'],
            pharmacy: ['veterinár', 'veterinar', 'agropecuária', 'agropecuaria', 'pet', 'animal'],
            supermarket: ['hospital', 'clinica', 'clínica', 'farmacia', 'farmácia'],
            gym: ['fisioterapia', 'clinica', 'clínica'],
            restaurant: ['hospital', 'clinica', 'clínica', 'farmacia', 'farmácia', 'escola'],
            bakery: ['hospital', 'clinica', 'clínica'],
            pet_store: ['hospital', 'clinica', 'clínica', 'farmacia', 'farmácia'],
        };

        const termosFiltro = filtrosIrrelevantes[tipo] || [];
        if (termosFiltro.length > 0) {
            return listaMapeada.filter(p => {
                const nome = p.nome.toLowerCase();
                return !termosFiltro.some(i => nome.includes(i));
            });
        }

        return listaMapeada;

    } catch (err) {
        console.log("Erro Google Places:", err.message);
        return [];
    }
}

async function buscarDadosPatrocinador(nome) {
    try {
        const resposta = await axios.post(
            'https://places.googleapis.com/v1/places:searchText',
            {
                textQuery: `${nome} Sarandi RS Brasil`,
                maxResultCount: 1,
                languageCode: 'pt-BR'
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': process.env.GOOGLE_PLACES_KEY,
                    'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.shortFormattedAddress,places.currentOpeningHours'
                }
            }
        );
        const lugar = resposta.data?.places?.[0];
        console.log('🔍 RAW PATROCINADOR:', JSON.stringify(lugar));
        if (!lugar) return null;

        const diaIndex = obterIndiceDiaGoogle();

        return {
            endereco: lugar.formattedAddress || '',
            telefone: lugar.nationalPhoneNumber || '',
            aberto: lugar.currentOpeningHours?.openNow === true,
            horario: (lugar.currentOpeningHours?.weekdayDescriptions?.[diaIndex] || '').replace(/^[^:]+:\s*/, '')
        };
    } catch (err) {
        console.log('Erro buscarDadosPatrocinador:', err.message);
        return null;
    }
}

module.exports = { buscarOSM, obterCidadePorCoordenadas, buscarDadosPatrocinador };