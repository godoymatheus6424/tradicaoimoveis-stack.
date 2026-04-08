const express = require('express');
const router = express.Router();
const db = require('../db');

function formatarPreco(valor) {
  if (!valor || Number(valor) === 0) return 'Consulte o Valor';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

// GET /
router.get('/', async (req, res) => {
  try {
    const fotoSql = `(SELECT path FROM imovel_fotos WHERE imovel_id = i.id AND principal = true LIMIT 1)`;

    const destaqueRes = await db.raw(
      `SELECT i.*, c.nome AS categoria_nome, ${fotoSql} AS foto_principal
       FROM imoveis i
       LEFT JOIN categorias c ON c.id = i.categoria_id
       WHERE i.destaque = true AND i.ativo = true
       ORDER BY COALESCE(i.ordem_destaque, 999) ASC, i.updated_at DESC LIMIT 3`
    );
    const destaques = destaqueRes.rows || [];
    
    if (destaques.length > 0) {
      const destaqueIds = destaques.map(d => d.id);
      const fotosRes = await db.raw(
        `SELECT imovel_id, path FROM imovel_fotos WHERE imovel_id = ANY(?) ORDER BY principal DESC, ordem ASC`,
        [destaqueIds]
      );
      destaques.forEach(d => {
        d.fotos = fotosRes.rows.filter(f => f.imovel_id === d.id).map(f => f.path);
        // Fallback case has no photos natively
        if (d.fotos.length === 0 && d.foto_principal) d.fotos = [d.foto_principal];
        else if (d.fotos.length === 0) d.fotos = ['/images/hero-bg.jpg'];
        d.preco_formatado = formatarPreco(d.preco);
      });
    }

    const aptRes = await db.raw(
      `SELECT i.*, ${fotoSql} AS foto_principal
       FROM imoveis i
       WHERE i.ativo = true AND LOWER(i.tipo) LIKE '%apartamento%'
       ORDER BY i.updated_at DESC LIMIT 8`
    );
    const apartamentos = aptRes.rows || [];
    apartamentos.forEach(d => d.preco_formatado = formatarPreco(d.preco));

    const casasRes = await db.raw(
      `SELECT i.*, ${fotoSql} AS foto_principal
       FROM imoveis i
       WHERE i.ativo = true AND (LOWER(i.tipo) LIKE '%casa%' OR LOWER(i.tipo) LIKE '%sobrado%')
       ORDER BY i.updated_at DESC LIMIT 8`
    );
    const casas = casasRes.rows || [];
    casas.forEach(d => d.preco_formatado = formatarPreco(d.preco));

    const comRes = await db.raw(
      `SELECT i.*, ${fotoSql} AS foto_principal
       FROM imoveis i
       WHERE i.ativo = true AND (
         LOWER(i.tipo) LIKE '%comercial%' OR LOWER(i.tipo) LIKE '%sala%' OR
         LOWER(i.tipo) LIKE '%galpão%' OR LOWER(i.tipo) LIKE '%loja%' OR
         LOWER(i.tipo) LIKE '%barrac%' OR LOWER(i.tipo) LIKE '%galp%'
       )
       ORDER BY i.updated_at DESC LIMIT 8`
    );
    const comerciais = comRes.rows || [];
    comerciais.forEach(d => d.preco_formatado = formatarPreco(d.preco));

    res.render('home', {
      title: 'Tradição Imóveis — Maringá',
      destaques,
      apartamentos,
      casas,
      comerciais,
    });
  } catch (err) {
    console.error(err);
    res.render('home', { title: 'Tradição Imóveis — Maringá', destaques: [], apartamentos: [], casas: [], comerciais: [] });
  }
});

// GET /imoveis
router.get('/imoveis', async (req, res) => {
  try {
    const categoriasRes = await db.raw(
      'SELECT * FROM categorias WHERE ativo = true ORDER BY ordem ASC'
    );
    res.render('imoveis', {
      title: 'Nossos Imóveis — Tradição Imóveis',
      categorias: categoriasRes.rows,
      filtros: req.query,
    });
  } catch (err) {
    console.error(err);
    res.render('imoveis', {
      title: 'Nossos Imóveis — Tradição Imóveis',
      categorias: [],
      filtros: {},
    });
  }
});

// GET /imovel/:id
router.get('/imovel/:id', async (req, res) => {
  const { id } = req.params;
  if (isNaN(id)) return res.status(404).render('404', { title: 'Não encontrado' });

  try {
    const imovelRes = await db.raw(
      `SELECT i.*, c.nome AS categoria_nome
       FROM imoveis i
       LEFT JOIN categorias c ON c.id = i.categoria_id
       WHERE i.id = ? AND i.ativo = true`,
      [id]
    );
    const imovel = imovelRes.rows[0];
    if (!imovel) return res.status(404).render('404', { title: 'Imóvel não encontrado' });

    imovel.preco_formatado = formatarPreco(imovel.preco);

    const fotosRes = await db.raw(
      'SELECT * FROM imovel_fotos WHERE imovel_id = ? ORDER BY principal DESC, ordem ASC',
      [id]
    );

    const imoveisRes = await db.raw(
      `SELECT i.*, (SELECT path FROM imovel_fotos WHERE imovel_id = i.id AND principal = true LIMIT 1) AS foto_principal
       FROM imoveis i WHERE i.id != ? AND i.ativo = true ORDER BY RANDOM() LIMIT 3`,
      [id]
    );
    const relacionados = imoveisRes.rows.map((im) => ({
      ...im,
      preco_formatado: formatarPreco(im.preco),
    }));

    res.render('imovel-detalhes', {
      title: `${imovel.titulo} — Tradição Imóveis`,
      imovel,
      fotos: fotosRes.rows,
      relacionados,
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('404', { title: 'Erro' });
  }
});

// GET /contato
router.get('/contato', async (req, res) => {
  try {
    const imoveisRes = await db.raw(
      'SELECT id, titulo FROM imoveis WHERE ativo = true ORDER BY titulo ASC'
    );
    res.render('contato', {
      title: 'Fale Conosco — Tradição Imóveis',
      imoveis: imoveisRes.rows,
      success: req.query.success === '1',
    });
  } catch (err) {
    console.error(err);
    res.render('contato', { title: 'Fale Conosco — Tradição Imóveis', imoveis: [], success: false });
  }
});

// GET /sobre
router.get('/sobre', (req, res) => {
  res.render('sobre', { title: 'Sobre Nós — Tradição Imóveis' });
});

module.exports = router;
