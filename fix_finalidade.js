const db = require('./db');
db.raw("UPDATE imoveis SET finalidade = 'aluguel' WHERE finalidade = 'locacao'")
  .then(r => { console.log('Rows restored:', r.rowCount); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
