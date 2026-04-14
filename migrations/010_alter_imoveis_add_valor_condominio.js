exports.up = function (knex) {
  return knex.schema.alterTable('imoveis', (table) => {
    table.decimal('valor_condominio', 12, 2).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('imoveis', (table) => {
    table.dropColumn('valor_condominio');
  });
};
