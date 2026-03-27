exports.up = function (knex) {
  return knex.schema.createTable('imoveis', (table) => {
    table.increments('id').primary();
    table.string('titulo', 200).notNullable();
    table.text('descricao');
    table.string('tipo', 50).notNullable();
    table.string('finalidade', 20).notNullable().defaultTo('venda');
    table.decimal('preco', 14, 2).notNullable();
    table.decimal('area_total', 10, 2);
    table.decimal('area_construida', 10, 2);
    table.integer('quartos').defaultTo(0);
    table.integer('suites').defaultTo(0);
    table.integer('banheiros').defaultTo(0);
    table.integer('vagas_garagem').defaultTo(0);
    table.string('endereco', 300);
    table.string('bairro', 100);
    table.string('cidade', 100).defaultTo('Maringá');
    table.string('estado', 2).defaultTo('PR');
    table.string('cep', 10);
    table.integer('categoria_id').references('id').inTable('categorias');
    table.boolean('destaque').defaultTo(false);
    table.boolean('novo').defaultTo(false);
    table.boolean('ativo').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('imoveis');
};
