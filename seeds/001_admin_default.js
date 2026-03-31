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
      nome: 'Residencial',
      slug: 'residencial',
      subtitulo: 'Casa, Apto e Sobrado',
      imagem_url: '/images/categoria-residencial.jpg',
      ordem: 1,
      ativo: true,
    },
    {
      nome: 'Comercial e Industrial',
      slug: 'comercial-industrial',
      subtitulo: 'Galpão, Sala e Barracão',
      imagem_url: '/images/categoria-comercial.jpg',
      ordem: 2,
      ativo: true,
    },
    {
      nome: 'Terrenos',
      slug: 'terrenos',
      subtitulo: 'Lotes e Terrenos',
      imagem_url: '/images/categoria-terrenos.jpg',
      ordem: 3,
      ativo: true,
    },
    {
      nome: 'Rural',
      slug: 'rural',
      subtitulo: 'Chácara, Sítio e Fazenda',
      imagem_url: '/images/categoria-rural.jpg',
      ordem: 4,
      ativo: true,
    },
  ]);
};
