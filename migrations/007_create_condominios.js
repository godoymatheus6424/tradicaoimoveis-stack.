exports.up = function (knex) {
  return knex.schema
    .createTable('condominios', (table) => {
      table.increments('id').primary();
      table.string('nome', 255).notNullable();
      table.decimal('valor', 12, 2).defaultTo(0);
      table.text('descricao');
      table.text('caracteristicas');
      table.string('endereco', 255);
      table.string('bairro', 100);
      table.string('cidade', 100).defaultTo('Maringá');
      table.string('estado', 2).defaultTo('PR');
      table.string('cep', 10);
      table.boolean('ativo').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    .createTable('condominio_fotos', (table) => {
      table.increments('id').primary();
      table.integer('condominio_id').references('id').inTable('condominios').onDelete('CASCADE');
      table.string('filename', 255).notNullable();
      table.string('path', 500).notNullable();
      table.boolean('principal').defaultTo(false);
      table.integer('ordem').defaultTo(0);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('condominio_fotos')
    .dropTableIfExists('condominios');
};
