require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

console.log('Supabase URL:', supabaseUrl);
console.log('Using Service Role Key:', supabaseKey === process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!supabaseUrl || !supabaseKey) {
  console.error('Erro: SUPABASE_URL ou chaves não configuradas no .env!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  try {
    console.log('\n--- TESTANDO TABELA USERS ---');
    const { data: users, error: errUsers } = await supabase.from('users').select('*').limit(3);
    if (errUsers) {
      console.error('Erro ao buscar users:', errUsers.message || errUsers);
    } else {
      console.log('Users encontrados:', users);
    }

    console.log('\n--- TESTANDO TABELA ACERVO ---');
    const { data: acervo, error: errAcervo } = await supabase.from('acervo').select('*').limit(5);
    if (errAcervo) {
      console.error('Erro ao buscar acervo:', errAcervo.message || errAcervo);
    } else {
      console.log('Itens do acervo encontrados:', acervo);
    }

  } catch (err) {
    console.error('Exceção geral:', err.message);
  }
}

test();
