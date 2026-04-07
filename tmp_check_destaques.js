const db = require('./db');
async function run() {
  const result = await db.raw('SELECT id, titulo, destaque FROM imoveis WHERE destaque = true');
  console.log(`FOUND ${result.rows.length} destaques:`);
  console.log(JSON.stringify(result.rows, null, 2));
  process.exit();
}
run();
