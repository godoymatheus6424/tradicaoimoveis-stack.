exports.up = function (knex) {
  return knex.schema.createTable('categorias', (table) => {
    table.increments('id').primary();
    table.string('nome', 100).notNullable();
    table.string('slug', 100).unique().notNullable();
    table.string('subtitulo', 50);
    table.string('imagem_url', 500);
    table.integer('ordem').defaultTo(0);
    table.boolean('ativo').defaultTo(true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('categorias');
};
