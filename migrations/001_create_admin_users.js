exports.up = function (knex) {
  return knex.schema.createTable('admin_users', (table) => {
    table.increments('id').primary();
    table.string('nome', 100).notNullable();
    table.string('email', 200).unique().notNullable();
    table.string('senha', 255).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('admin_users');
};
