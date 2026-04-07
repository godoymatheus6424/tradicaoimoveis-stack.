exports.up = function (knex) {
  return knex.schema.alterTable('imoveis', (table) => {
    table.string('andar', 20).nullable();
    table.string('apto', 20).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('imoveis', (table) => {
    table.dropColumn('andar');
    table.dropColumn('apto');
  });
};
