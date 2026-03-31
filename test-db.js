require('dotenv').config();
const knex = require('./db');
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 5433,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'tradicao_imoveis',
});

setTimeout(() => {
  console.log('Timeout reached. Something is hanging.');
  process.exit(1);
}, 5000);

async function test() {
  console.log('Testing pg.Pool...');
  try {
    const res1 = await pool.query('SELECT 1');
    console.log('pg.Pool OK', res1.rows);
  } catch (err) {
    console.error('pg.Pool Error:', err);
  }
  
  console.log('Testing knex...');
  try {
    const res2 = await knex.raw('SELECT 1');
    console.log('knex OK', res2.rows);
  } catch (err) {
    console.error('knex Error:', err);
  }
  process.exit(0);
}
test();
