require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Limpa acentos para facilitar a busca
function removerAcentos(str) {
    return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function buscarEmpresas(categoria, cidade) {
    if (!categoria) return [];

    const cidadeFinal = cidade || 'Sarandi';
    
    // Remove pontuação que quebra o banco
    const categoriaLimpa = categoria.replace(/[,()]/g, ''); 
    const categoriaNorm = removerAcentos(categoriaLimpa);

    const { data, error } = await supabase
        .from('Empresas')
        .select('*')
        .ilike('cidade', `%${cidadeFinal}%`)
        .or(`nome.ilike.%${categoriaLimpa}%,categoria.ilike.%${categoriaLimpa}%,nome.ilike.%${categoriaNorm}%,categoria.ilike.%${categoriaNorm}%`);

    if (error) {
        console.log('Erro ao buscar empresas:', error);
        return [];
    }

    console.log("🔎 RESULTADO:", data);
    return data;
}

async function salvarHistorico(telefone, mensagem, papel) {
    const { error } = await supabase
        .from('historico')
        .insert([{ telefone, mensagem, papel }]);

    if (error) {
        console.log('Erro ao salvar histórico:', error);
    }
}

async function buscarHistorico(telefone) {
    const { data, error } = await supabase
        .from('historico')
        .select('*')
        .eq('telefone', telefone)
        .order('created_at', { ascending: false }) // Pega os mais recentes
        .limit(10);

    if (error) {
        console.log('Erro ao buscar histórico:', error);
        return [];
    }
    
    // Deixa na ordem certa de leitura (antigas para novas)
    return data ? data.reverse() : []; 
}

async function buscarPatrocinadores(termoBusca, cidade) {
    if (!termoBusca) return [];

    // Tira a sigla do estado se a IA mandar junto
    const cidadeLimpa = (cidade || 'Sarandi')
        .replace(/\s*-\s*RS\s*$/i, '')
        .replace(/,\s*RS\s*$/i, '')
        .trim();

    // Remove pontuação do termo de busca
    const termoLimpo = termoBusca.replace(/[,()]/g, '');
    const termoNorm = removerAcentos(termoLimpo);

    const queryOr = `nome.ilike.%${termoLimpo}%,categoria.ilike.%${termoLimpo}%,nome.ilike.%${termoNorm}%,categoria.ilike.%${termoNorm}%`;

    const { data, error } = await supabase
        .from('patrocinadores')
        .select('*')
        .ilike('cidade', `%${cidadeLimpa}%`)
        .or(queryOr)
        .order('estrelas', { ascending: false });

    if (error) {
        console.log('Erro ao buscar patrocinadores:', error);
        return [];
    }
    
    console.log(`⭐ PATROCINADORES ENCONTRADOS NO BANCO: ${data ? data.length : 0}`);
    return data || [];
}

module.exports = { buscarEmpresas, salvarHistorico, buscarHistorico, buscarPatrocinadores };