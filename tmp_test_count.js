const dotenv = require('dotenv');
dotenv.config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const res = await pool.query('SELECT COUNT(*) FROM imoveis WHERE destaque = true');
  console.log('COUNT = ', res.rows[0].count);
  console.log('TYPE = ', typeof res.rows[0].count);
  process.exit(0);
}
run();
