exports.up = function (knex) {
  return knex.schema.createTable('imovel_fotos', (table) => {
    table.increments('id').primary();
    table.integer('imovel_id').references('id').inTable('imoveis').onDelete('CASCADE');
    table.string('filename', 255).notNullable();
    table.string('path', 500).notNullable();
    table.boolean('principal').defaultTo(false);
    table.integer('ordem').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('imovel_fotos');
};
