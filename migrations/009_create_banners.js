exports.up = function (knex) {
  return knex.schema.createTable('banners', function (t) {
    t.increments('id');
    t.string('titulo', 200).notNullable();
    t.string('imagem_url', 500).notNullable();
    t.string('whatsapp_numero', 30);
    t.string('whatsapp_mensagem', 500);
    t.integer('ordem').defaultTo(0);
    t.boolean('ativo').defaultTo(true);
    t.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('banners');
};
