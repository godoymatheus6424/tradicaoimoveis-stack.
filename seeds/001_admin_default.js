const bcrypt = require('bcrypt');

exports.seed = async function (knex) {
  // Admin user
  await knex('admin_users').del();
  const hash = await bcrypt.hash('admin123', 10);
  await knex('admin_users').insert([
    {
      nome: 'Administrador',
      email: 'admin@tradicao.com',
      senha: hash,
    },
  ]);

  // Categorias
  await knex('categorias').del();
  await knex('categorias').insert([
    {
      nome: 'Casas de Campo',
      slug: 'casas-de-campo',
      subtitulo: 'Tradição',
      imagem_url: '/images/categoria-campo.jpg',
      ordem: 1,
      ativo: true,
    },
    {
      nome: 'Litoral',
      slug: 'litoral',
      subtitulo: 'Exclusivo',
      imagem_url: '/images/categoria-litoral.jpg',
      ordem: 2,
      ativo: true,
    },
    {
      nome: 'Penthouses',
      slug: 'penthouses',
      subtitulo: 'Moderno',
      imagem_url: '/images/categoria-penthouse.jpg',
      ordem: 3,
      ativo: true,
    },
    {
      nome: 'Investimentos Corporativos',
      slug: 'investimentos-corporativos',
      subtitulo: 'Estratégico',
      imagem_url: '/images/categoria-corporativo.jpg',
      ordem: 4,
      ativo: true,
    },
  ]);
};
