// carrega as variáveis do arquivo.env 
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function buscarUsuario(telefone) {
    const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('telefone', telefone)
        .single();

    if (error) return null;
    return data;
}

async function salvarUsuario(telefone, nome, cidade) {
    const { error } = await supabase
        .from('usuarios')
        .upsert([{ telefone, nome, cidade }]);

    if (error) console.log('Erro ao salvar usuário: ', error);
}

async function salvarLocalizacao(telefone, lat, lon) {
    const { error } = await supabase
        .from('usuarios')
        .update({ lat, lon })
        .eq('telefone', telefone);

    if (error) console.log('Erro ao salvar localização:', error);
}

async function buscarUltimasPesquisas(telefone) {
    const { data, error } = await supabase
        .from('pesquisas')
        .select('termo, cidade, created_at')
        .eq('telefone', telefone)
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) return [];
    return data || [];
}

async function salvarPesquisa(telefone, termo, cidade) {
    const { error } = await supabase
        .from('pesquisas')
        .insert([{ telefone, termo, cidade }]);

    if (error) console.log('Erro ao salvar pesquisa:', error);
}

module.exports = {
    buscarUsuario,
    salvarUsuario,
    salvarLocalizacao,
    salvarPesquisa,
    buscarUltimasPesquisas
};