const db = require('./db');
async function run() {
  const t = await db.raw('SELECT COUNT(*) FROM imoveis WHERE destaque = true');
  console.log(JSON.stringify(t.rows));
  process.exit();
}
run();
