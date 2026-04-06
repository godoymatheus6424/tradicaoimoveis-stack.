require('dotenv').config();
const { uploadToSupabase } = require('./supabase');
const fs = require('fs');

async function test() {
  fs.writeFileSync('dummy.txt', 'hello world');
  try {
    const url = await uploadToSupabase('dummy.txt', 'imoveis/dummy.txt', 'text/plain');
    console.log('Sucesso! URL:', url);
  } catch (e) {
    console.error('ERRO:', e);
  }
}
test();
