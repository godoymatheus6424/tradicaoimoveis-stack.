const express = require('express');
const router = express.Router();
const db = require('../db');

function formatarPreco(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

// GET /api/imoveis/destaques
router.get('/imoveis/destaques', async (req, res) => {
  try {
    const result = await db.raw(
      `SELECT i.*, c.nome AS categoria_nome,
        (SELECT path FROM imovel_fotos WHERE imovel_id = i.id AND principal = true LIMIT 1) AS foto_principal
       FROM imoveis i
       LEFT JOIN categorias c ON c.id = i.categoria_id
       WHERE i.destaque = true AND i.ativo = true
       ORDER BY i.created_at DESC LIMIT 6`
    );
    const rows = result.rows.map((i) => ({ ...i, preco_formatado: formatarPreco(i.preco) }));
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

// GET /api/imoveis
router.get('/imoveis', async (req, res) => {
  const {
    tipo, finalidade, preco_min, preco_max,
    quartos, cidade, bairro, categoria_id,
    page = 1, limit = 12,
  } = req.query;

  const params = [];
  const conditions = ['i.ativo = true'];

  if (tipo) { params.push(tipo); conditions.push(`i.tipo = $${params.length}`); }
  if (finalidade) { params.push(finalidade); conditions.push(`i.finalidade = $${params.length}`); }
  if (preco_min && !isNaN(preco_min)) { params.push(parseFloat(preco_min)); conditions.push(`i.preco >= $${params.length}`); }
  if (preco_max && !isNaN(preco_max)) { params.push(parseFloat(preco_max)); conditions.push(`i.preco <= $${params.length}`); }
  if (quartos && !isNaN(quartos)) { params.push(parseInt(quartos)); conditions.push(`i.quartos >= $${params.length}`); }
  if (cidade) { params.push(`%${cidade}%`); conditions.push(`i.cidade ILIKE $${params.length}`); }
  if (bairro) { params.push(`%${bairro}%`); conditions.push(`i.bairro ILIKE $${params.length}`); }
  if (categoria_id && !isNaN(categoria_id)) { params.push(parseInt(categoria_id)); conditions.push(`i.categoria_id = $${params.length}`); }

  const where = conditions.join(' AND ');
  const offset = (parseInt(page) - 1) * parseInt(limit);

  params.push(parseInt(limit));
  const limitParam = params.length;
  params.push(offset);
  const offsetParam = params.length;

  try {
    const [dataRes, countRes] = await Promise.all([
      db.raw(
        `SELECT i.*, c.nome AS categoria_nome,
          (SELECT path FROM imovel_fotos WHERE imovel_id = i.id AND principal = true LIMIT 1) AS foto_principal
         FROM imoveis i
         LEFT JOIN categorias c ON c.id = i.categoria_id
         WHERE ${where}
         ORDER BY i.destaque DESC, i.created_at DESC
         LIMIT $${limitParam} OFFSET $${offsetParam}`,
        params
      ),
      db.raw(
        `SELECT COUNT(*) FROM imoveis i WHERE ${where}`,
        params.slice(0, params.length - 2)
      ),
    ]);

    const rows = dataRes.rows.map((i) => ({ ...i, preco_formatado: formatarPreco(i.preco) }));
    const total = parseInt(countRes.rows[0].count);

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

// GET /api/imoveis/:id
router.get('/imoveis/:id', async (req, res) => {
  const { id } = req.params;
  if (isNaN(id)) return res.status(400).json({ success: false, error: 'ID inválido.' });

  try {
    const [imovelRes, fotosRes] = await Promise.all([
      db.raw(
        `SELECT i.*, c.nome AS categoria_nome
         FROM imoveis i
         LEFT JOIN categorias c ON c.id = i.categoria_id
         WHERE i.id = $1 AND i.ativo = true`,
        [id]
      ),
      db.raw(
        'SELECT * FROM imovel_fotos WHERE imovel_id = $1 ORDER BY principal DESC, ordem ASC',
        [id]
      ),
    ]);

    const imovel = imovelRes.rows[0];
    if (!imovel) return res.status(404).json({ success: false, error: 'Imóvel não encontrado.' });

    imovel.preco_formatado = formatarPreco(imovel.preco);
    res.json({ success: true, data: { ...imovel, fotos: fotosRes.rows } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

// GET /api/categorias
router.get('/categorias', async (req, res) => {
  try {
    const result = await db.raw('SELECT * FROM categorias WHERE ativo = true ORDER BY ordem ASC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

// POST /api/contatos
router.post('/contatos', async (req, res) => {
  const { nome, email, telefone, imovel_id, mensagem } = req.body;

  if (!nome || !email) {
    return res.status(400).json({ success: false, error: 'Nome e e-mail são obrigatórios.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, error: 'E-mail inválido.' });
  }

  try {
    await db.raw(
      `INSERT INTO contatos (imovel_id, nome, email, telefone, mensagem)
       VALUES ($1, $2, $3, $4, $5)`,
      [imovel_id || null, nome.trim(), email.trim(), telefone || null, mensagem || null]
    );
    res.json({ success: true, message: 'Contato recebido com sucesso!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erro ao salvar contato.' });
  }
});

module.exports = router;
