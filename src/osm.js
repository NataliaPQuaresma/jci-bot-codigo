require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');


// CATEGORIAS 
const CATEGORIAS = {
    mercado: {
        sinonimos: ['mercado', 'supermercado', 'mercadinho', 'mercearia', 'minimercado', 'market'],
        tipo: 'supermarket'
    },
    farmacia: {
        sinonimos: ['farmácia', 'farmacia', 'drogaria', 'remédio', 'remedio'],
        tipo: 'pharmacy'
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
        sinonimos: ['roupa', 'roupas', 'loja de roupa', 'loja de roupas', 'vestuario', 'vestuário', 'moda'],
        tipo: 'clothing_store'
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
        sinonimos: ['loja de roupa infantil', 'roupa de crianca', 'roupa de criança', 'roupa infantil'],
        tipo: 'clothing_store'
    },
    bar: {
        sinonimos: ['bar', 'cerveja', 'bebida', 'boteco', 'barzinho'],
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
};


// COORDENADAS DAS CIDADES — adicione novas aqui

const COORDS_CIDADES = {
    'sarandi':      { lat: -27.9408, lon: -52.9228 },
    'passo fundo':  { lat: -28.2620, lon: -52.4083 },
    'carazinho':    { lat: -28.2833, lon: -52.7833 },
    'marau':        { lat: -28.4500, lon: -52.2167 },
};

const palavrasAnimal = ['pet', 'animal', 'veterinár', 'veterinar', 'agropecuária', 'agropecuaria'];


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

// DETECTA CATEGORIA DA BUSCA

function detectarCategoria(query) {
    const queryLower = (query || '').toLowerCase().trim();
    for (const [, dados] of Object.entries(CATEGORIAS)) {
        if (dados.sinonimos.some(sin => queryLower.includes(sin))) {
            return dados.tipo;
        }
    }
    return null;
}

// NORMALIZA NOME DE CIDADE

function normalizarCidade(cidade) {
    return (cidade || '')
        .replace(/,?\s*RS\s*$/i, '')
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
            return { erro: `Não encontrei a cidade *${cidade}*. Por enquanto atendo: ${Object.keys(COORDS_CIDADES).join(', ')}.` };
        }

        const tipo = detectarCategoria(query);

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

            return lugaresTexto
                .filter(p => p.businessStatus === 'OPERATIONAL')
                .map(p => ({
                    nome: p.displayName?.text || 'Sem nome',
                    endereco: p.formattedAddress || cidade,
                    telefone: p.nationalPhoneNumber || '',
                    aberto: p.currentOpeningHours?.openNow === true,
                    horario: p.currentOpeningHours?.weekdayDescriptions?.[new Date().getDay() - 1] || ''
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

            const listaFinal = operacionais;

    return listaFinal.map(p => {
    const resultado = {
        nome: p.displayName?.text || 'Sem nome',
        endereco: p.formattedAddress || cidadeNormalizada,
        telefone: p.nationalPhoneNumber || '',
        aberto: p.currentOpeningHours?.openNow === true,
        horario: p.currentOpeningHours?.weekdayDescriptions?.[new Date().getDay() - 1] || ''
    };
    console.log('🏨 LUGAR:', resultado.nome, '| ABERTO:', resultado.aberto, '| HORARIO:', resultado.horario);
    return resultado;
});

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
                    'Context-Type': 'application/json',
                    'X-Goog-Api-Key': process.env.GOOGLE_PLACES_KEY,
                    'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.shortFormattedAddress,places.currentOpeningHours'                  
                }
            }
        );
        const lugar = resposta.data?.places?.[0];
        console.log('🔍 RAW PATROCINADOR:', JSON.stringify(lugar));
        if (!lugar) return null;

        return {
            endereco: lugar.formattedAddress || '',
            telefone: lugar.nationalPhoneNumber || '',
            aberto: lugar.currentOpeningHours?.openNow === true,
            horario: lugar.currentOpeningHours?.weekdayDescriptions?.[new Date ().getDay() - 1] || ''
        };
    } catch (err) {
        console.log('Erro buscarDadosPatrocinador:', err.message);
        return null;
    }
}
module.exports = { buscarOSM, obterCidadePorCoordenadas, buscarDadosPatrocinador };