exports.up = function (knex) {
  return knex.schema.alterTable('imoveis', (table) => {
    table.decimal('preco', 14, 2).nullable().alter();
    table.string('condominio', 200).nullable();
    table.string('url_original', 500).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('imoveis', (table) => {
    table.decimal('preco', 14, 2).notNullable().alter();
    table.dropColumn('condominio');
    table.dropColumn('url_original');
  });
};
