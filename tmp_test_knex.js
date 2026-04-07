const db = require('./db');
const ids = [37, 41];
console.log(db.raw('SELECT * FROM imovel_fotos WHERE imovel_id = ANY(?)', [ids]).toString());
process.exit();
