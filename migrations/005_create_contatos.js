exports.up = function (knex) {
  return knex.schema.createTable('contatos', (table) => {
    table.increments('id').primary();
    table.integer('imovel_id').references('id').inTable('imoveis').onDelete('SET NULL');
    table.string('nome', 100).notNullable();
    table.string('email', 200).notNullable();
    table.string('telefone', 20);
    table.text('mensagem');
    table.boolean('lido').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('contatos');
};
