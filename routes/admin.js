const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const upload = require('../middleware/upload');

function formatarPreco(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

// Redirect /admin -> /admin/dashboard
router.get('/', isAuthenticated, (req, res) => res.redirect('/admin/dashboard'));

// GET /admin/dashboard
router.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    const [totalRes, ativosRes, contatosRes, recentes] = await Promise.all([
      db.raw('SELECT COUNT(*) FROM imoveis'),
      db.raw('SELECT COUNT(*) FROM imoveis WHERE ativo = true'),
      db.raw('SELECT COUNT(*) FROM contatos WHERE lido = false'),
      db.raw(
        `SELECT i.*, (SELECT path FROM imovel_fotos WHERE imovel_id = i.id AND principal = true LIMIT 1) AS foto_principal
         FROM imoveis i ORDER BY i.created_at DESC LIMIT 5`
      ),
    ]);

    res.render('admin/dashboard', {
      title: 'Dashboard — Admin',
      adminNome: req.session.adminNome,
      metricas: {
        total: totalRes.rows[0].count,
        ativos: ativosRes.rows[0].count,
        contatos: contatosRes.rows[0].count,
      },
      recentes: recentes.rows.map((i) => ({ ...i, preco_formatado: formatarPreco(i.preco) })),
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/login');
  }
});

// GET /admin/imoveis
router.get('/imoveis', isAuthenticated, async (req, res) => {
  try {
    const result = await db.raw(
      `SELECT i.*, c.nome AS categoria_nome,
        (SELECT path FROM imovel_fotos WHERE imovel_id = i.id AND principal = true LIMIT 1) AS foto_principal
       FROM imoveis i
       LEFT JOIN categorias c ON c.id = i.categoria_id
       ORDER BY i.created_at DESC`
    );
    res.render('admin/imoveis-lista', {
      title: 'Imóveis — Admin',
      adminNome: req.session.adminNome,
      imoveis: result.rows.map((i) => ({ ...i, preco_formatado: formatarPreco(i.preco) })),
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/dashboard');
  }
});

// GET /admin/imoveis/novo
router.get('/imoveis/novo', isAuthenticated, async (req, res) => {
  const categorias = await db.raw('SELECT * FROM categorias WHERE ativo = true ORDER BY ordem');
  res.render('admin/imovel-form', {
    title: 'Novo Imóvel — Admin',
    adminNome: req.session.adminNome,
    imovel: null,
    fotos: [],
    categorias: categorias.rows,
    errors: [],
  });
});

// POST /admin/imoveis
router.post('/imoveis', isAuthenticated, upload.array('fotos', 20), async (req, res) => {
  const {
    titulo, descricao, tipo, finalidade, preco,
    area_total, area_construida, quartos, suites,
    banheiros, vagas_garagem, endereco, bairro,
    cidade, estado, cep, categoria_id,
    destaque, novo,
  } = req.body;

  const errors = [];
  if (!titulo) errors.push('Título obrigatório.');
  if (!tipo) errors.push('Tipo obrigatório.');
  if (!finalidade) errors.push('Finalidade obrigatória.');
  if (!preco || isNaN(preco)) errors.push('Preço inválido.');

  if (errors.length) {
    const categorias = await db.raw('SELECT * FROM categorias WHERE ativo = true ORDER BY ordem');
    return res.render('admin/imovel-form', {
      title: 'Novo Imóvel — Admin',
      adminNome: req.session.adminNome,
      imovel: req.body,
      fotos: [],
      categorias: categorias.rows,
      errors,
    });
  }

  try {
    const result = await db.raw(
      `INSERT INTO imoveis (titulo, descricao, tipo, finalidade, preco, area_total, area_construida,
        quartos, suites, banheiros, vagas_garagem, endereco, bairro, cidade, estado, cep,
        categoria_id, destaque, novo, ativo, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,true,NOW())
       RETURNING id`,
      [
        titulo, descricao || null, tipo, finalidade, parseFloat(preco),
        area_total || null, area_construida || null,
        parseInt(quartos) || 0, parseInt(suites) || 0,
        parseInt(banheiros) || 0, parseInt(vagas_garagem) || 0,
        endereco || null, bairro || null,
        cidade || 'Maringá', estado || 'PR', cep || null,
        categoria_id || null,
        destaque === 'on', novo === 'on',
      ]
    );
    const imovelId = result.rows[0].id;

    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        await db.raw(
          `INSERT INTO imovel_fotos (imovel_id, filename, path, principal, ordem)
           VALUES ($1,$2,$3,$4,$5)`,
          [imovelId, file.filename, `/uploads/imoveis/${file.filename}`, i === 0, i]
        );
      }
    }

    res.redirect('/admin/imoveis');
  } catch (err) {
    console.error(err);
    const categorias = await db.raw('SELECT * FROM categorias WHERE ativo = true ORDER BY ordem');
    res.render('admin/imovel-form', {
      title: 'Novo Imóvel — Admin',
      adminNome: req.session.adminNome,
      imovel: req.body,
      fotos: [],
      categorias: categorias.rows,
      errors: ['Erro ao salvar imóvel.'],
    });
  }
});

// GET /admin/imoveis/:id/editar
router.get('/imoveis/:id/editar', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    const [imovelRes, fotosRes, categoriasRes] = await Promise.all([
      db.raw('SELECT * FROM imoveis WHERE id = $1', [id]),
      db.raw('SELECT * FROM imovel_fotos WHERE imovel_id = $1 ORDER BY ordem ASC', [id]),
      db.raw('SELECT * FROM categorias WHERE ativo = true ORDER BY ordem'),
    ]);
    const imovel = imovelRes.rows[0];
    if (!imovel) return res.redirect('/admin/imoveis');

    res.render('admin/imovel-form', {
      title: `Editar — ${imovel.titulo}`,
      adminNome: req.session.adminNome,
      imovel,
      fotos: fotosRes.rows,
      categorias: categoriasRes.rows,
      errors: [],
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/imoveis');
  }
});

// PUT /admin/imoveis/:id
router.put('/imoveis/:id', isAuthenticated, upload.array('fotos', 20), async (req, res) => {
  const { id } = req.params;
  const {
    titulo, descricao, tipo, finalidade, preco,
    area_total, area_construida, quartos, suites,
    banheiros, vagas_garagem, endereco, bairro,
    cidade, estado, cep, categoria_id,
    destaque, novo, ativo,
  } = req.body;

  const errors = [];
  if (!titulo) errors.push('Título obrigatório.');
  if (!tipo) errors.push('Tipo obrigatório.');
  if (!preco || isNaN(preco)) errors.push('Preço inválido.');

  if (errors.length) {
    const [fotosRes, categoriasRes] = await Promise.all([
      db.raw('SELECT * FROM imovel_fotos WHERE imovel_id = $1 ORDER BY ordem', [id]),
      db.raw('SELECT * FROM categorias WHERE ativo = true ORDER BY ordem'),
    ]);
    return res.render('admin/imovel-form', {
      title: 'Editar Imóvel',
      adminNome: req.session.adminNome,
      imovel: { ...req.body, id },
      fotos: fotosRes.rows,
      categorias: categoriasRes.rows,
      errors,
    });
  }

  try {
    await db.raw(
      `UPDATE imoveis SET titulo=$1, descricao=$2, tipo=$3, finalidade=$4, preco=$5,
        area_total=$6, area_construida=$7, quartos=$8, suites=$9, banheiros=$10,
        vagas_garagem=$11, endereco=$12, bairro=$13, cidade=$14, estado=$15, cep=$16,
        categoria_id=$17, destaque=$18, novo=$19, ativo=$20, updated_at=NOW()
       WHERE id=$21`,
      [
        titulo, descricao || null, tipo, finalidade || 'venda', parseFloat(preco),
        area_total || null, area_construida || null,
        parseInt(quartos) || 0, parseInt(suites) || 0,
        parseInt(banheiros) || 0, parseInt(vagas_garagem) || 0,
        endereco || null, bairro || null,
        cidade || 'Maringá', estado || 'PR', cep || null,
        categoria_id || null,
        destaque === 'on', novo === 'on', ativo === 'on',
        id,
      ]
    );

    if (req.files && req.files.length > 0) {
      const ordemRes = await db.raw(
        'SELECT COALESCE(MAX(ordem), -1) AS max FROM imovel_fotos WHERE imovel_id = $1',
        [id]
      );
      let ordem = ordemRes.rows[0].max + 1;
      for (const file of req.files) {
        await db.raw(
          `INSERT INTO imovel_fotos (imovel_id, filename, path, principal, ordem)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, file.filename, `/uploads/imoveis/${file.filename}`, false, ordem++]
        );
      }
    }

    res.redirect('/admin/imoveis');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/imoveis');
  }
});

// DELETE /admin/imoveis/:id
router.delete('/imoveis/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    const fotosRes = await db.raw('SELECT filename FROM imovel_fotos WHERE imovel_id = $1', [id]);
    for (const foto of fotosRes.rows) {
      const filePath = path.join(__dirname, '../public/uploads/imoveis', foto.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await db.raw('DELETE FROM imoveis WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir.' });
  }
});

// POST /admin/imoveis/:id/fotos
router.post('/imoveis/:id/fotos', isAuthenticated, upload.array('fotos', 20), async (req, res) => {
  const { id } = req.params;
  try {
    const ordemRes = await db.raw(
      'SELECT COALESCE(MAX(ordem), -1) AS max FROM imovel_fotos WHERE imovel_id = $1',
      [id]
    );
    let ordem = ordemRes.rows[0].max + 1;
    for (const file of req.files) {
      await db.raw(
        `INSERT INTO imovel_fotos (imovel_id, filename, path, principal, ordem)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, file.filename, `/uploads/imoveis/${file.filename}`, false, ordem++]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao adicionar fotos.' });
  }
});

// DELETE /admin/fotos/:id
router.delete('/fotos/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    const fotoRes = await db.raw('SELECT * FROM imovel_fotos WHERE id = $1', [id]);
    const foto = fotoRes.rows[0];
    if (!foto) return res.status(404).json({ error: 'Foto não encontrada.' });

    const filePath = path.join(__dirname, '../public/uploads/imoveis', foto.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await db.raw('DELETE FROM imovel_fotos WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir foto.' });
  }
});

// PUT /admin/fotos/:id/principal
router.put('/fotos/:id/principal', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    const fotoRes = await db.raw('SELECT imovel_id FROM imovel_fotos WHERE id = $1', [id]);
    const foto = fotoRes.rows[0];
    if (!foto) return res.status(404).json({ error: 'Foto não encontrada.' });

    await db.raw('UPDATE imovel_fotos SET principal = false WHERE imovel_id = $1', [foto.imovel_id]);
    await db.raw('UPDATE imovel_fotos SET principal = true WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro.' });
  }
});

// PUT /admin/imoveis/:id/destaque
router.put('/imoveis/:id/destaque', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.raw(
      'UPDATE imoveis SET destaque = NOT destaque WHERE id = $1 RETURNING destaque',
      [id]
    );
    res.json({ success: true, destaque: result.rows[0].destaque });
  } catch (err) {
    res.status(500).json({ error: 'Erro.' });
  }
});

// PUT /admin/imoveis/:id/ativo
router.put('/imoveis/:id/ativo', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.raw(
      'UPDATE imoveis SET ativo = NOT ativo WHERE id = $1 RETURNING ativo',
      [id]
    );
    res.json({ success: true, ativo: result.rows[0].ativo });
  } catch (err) {
    res.status(500).json({ error: 'Erro.' });
  }
});

// GET /admin/contatos
router.get('/contatos', isAuthenticated, async (req, res) => {
  try {
    const result = await db.raw(
      `SELECT ct.*, i.titulo AS imovel_titulo
       FROM contatos ct
       LEFT JOIN imoveis i ON i.id = ct.imovel_id
       ORDER BY ct.created_at DESC`
    );
    res.render('admin/contatos', {
      title: 'Contatos — Admin',
      adminNome: req.session.adminNome,
      contatos: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/dashboard');
  }
});

// PUT /admin/contatos/:id/lido
router.put('/contatos/:id/lido', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    await db.raw('UPDATE contatos SET lido = true WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro.' });
  }
});

module.exports = router;
