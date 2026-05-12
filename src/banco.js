require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function buscarEmpresas(categoria, cidade) {

    if (!categoria) return [];

    const cidadeFinal = cidade || 'Sarandi';

    const { data, error } = await supabase
        .from('Empresas')
        .select('*')
        .ilike('cidade', `%${cidadeFinal}%`)
        .or(`nome.ilike.%${categoria}%, categoria.ilike.%${categoria}%`);

if (error) {
    console.log('Erro ao buscar empresas: ', error);
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
        .order('created_at', { ascending: true })
        .limit(10);

    if (error) {
        console.log('Erro ao buscar histórico:', error);
        return [];
    }
    return data || [];
}
module.exports = { buscarEmpresas, salvarHistorico, buscarHistorico };

