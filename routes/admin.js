const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
// pdf-parse e mammoth carregados dinamicamente na rota

const db = require('../db');
const { isAuthenticated } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadToSupabase, deleteFromSupabase } = require('../supabase');

// Multer em memória só para a ficha PDF/DOCX
const fichaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

function parseImovelTexto(text) {
  const r = {};
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Tipo (primeira linha)
  const tipoMap = {
    apartamento: 'apartamento', casa: 'casa', terreno: 'terreno',
    comercial: 'comercial', rural: 'rural', cobertura: 'cobertura',
    sala: 'comercial', loja: 'comercial', galpão: 'comercial',
  };
  const primeiraLinha = lines[0]?.toLowerCase().trim();
  if (primeiraLinha && tipoMap[primeiraLinha]) r.tipo = tipoMap[primeiraLinha];

  // Nome do empreendimento → título sugerido
  if (lines[1] && lines[1] !== lines[0]) r.titulo = lines[1];

  // Finalidade
  r.finalidade = /loca[çc][aã]o|aluguel/i.test(text) ? 'aluguel' : 'venda';

  // Preço: "R$ 2.000,00"
  const precoM = text.match(/R\$\s*([\d.]+,\d{2})/);
  if (precoM) r.preco = parseFloat(precoM[1].replace(/\./g, '').replace(',', '.'));

  // Dormitórios → quartos
  const dormM = text.match(/Dormit[oó]rios?\s*\((\d+)\)/i);
  if (dormM) r.quartos = parseInt(dormM[1]);

  // Suítes
  const suiteM = text.match(/(\d+)\s+Su[ií]te/i);
  if (suiteM) r.suites = parseInt(suiteM[1]);

  // Banheiros
  const banhM = text.match(/Banheiros?\s*\((\d+)\)/i);
  if (banhM) r.banheiros = parseInt(banhM[1]);

  // Vagas de garagem
  const vagasM = text.match(/Garagens?\s*\((\d+)\)/i);
  if (vagasM) r.vagas_garagem = parseInt(vagasM[1]);

  // Áreas (valor na linha seguinte ao label)
  function extrairArea(label) {
    const m = text.match(new RegExp(label + '\\s*[\\r\\n]+([ \\d.,]+)\\s*m[²2]', 'i'));
    if (!m) return null;
    return parseFloat(m[1].trim().replace(/\./g, '').replace(',', '.'));
  }
  r.area_total     = extrairArea('[AÁ]rea Total') || null;
  r.area_construida = extrairArea('[AÁ]rea Constru[ií]da') || null;

  // Localização (seção estruturada)
  const endM   = text.match(/Endere[çc]o:\s*(.+)/i);
  const bairroM = text.match(/Bairro:\s*(.+)/i);
  const cidadeM = text.match(/Cidade:\s*(.+)/i);

  if (endM)    r.endereco = endM[1].trim();
  if (bairroM) r.bairro   = bairroM[1].trim();
  if (cidadeM) {
    const cv = cidadeM[1].trim();
    const ce = cv.match(/^(.+?)\s*[-–]\s*([A-Z]{2})$/);
    if (ce) { r.cidade = ce[1].trim(); r.estado = ce[2].trim(); }
    else r.cidade = cv;
  }

  // Descrição: entre "Descrição" e "Localização"
  const descM = text.match(/Descri[çc][aã]o\s*[\r\n]+([\s\S]+?)(?:Localiza[çc][aã]o|$)/i);
  if (descM) r.descricao = descM[1].replace(/\s+/g, ' ').trim();

  return r;
}

// POST /admin/imoveis/parse-doc
router.post('/imoveis/parse-doc', isAuthenticated, fichaUpload.single('ficha'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  try {
    let text = '';
    if (req.file.mimetype === 'application/pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(req.file.buffer);
      text = data.text;
    } else {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      text = result.value;
    }
    res.json({ success: true, data: parseImovelTexto(text) });
  } catch (err) {
    console.error('Erro ao parsear documento:', err);
    res.status(500).json({ success: false, error: 'Não foi possível ler o arquivo.' });
  }
});

function formatarPreco(valor) {
  if (!valor || Number(valor) === 0) return 'Consulte o Valor';
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
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,true,NOW())
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
        try {
          const publicUrl = await uploadToSupabase(file.path, `imoveis/${file.filename}`, file.mimetype) || `/uploads/imoveis/${file.filename}`;
          await db.raw(
            `INSERT INTO imovel_fotos (imovel_id, filename, path, principal, ordem)
             VALUES (?,?,?,?,?)`,
            [imovelId, file.filename, publicUrl, i === 0, i]
          );
          if (publicUrl !== `/uploads/imoveis/${file.filename}` && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (e) {
          console.error("Supabase upload error:", e);
        }
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
      db.raw('SELECT * FROM imoveis WHERE id = ?', [id]),
      db.raw('SELECT * FROM imovel_fotos WHERE imovel_id = ? ORDER BY ordem ASC', [id]),
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
      db.raw('SELECT * FROM imovel_fotos WHERE imovel_id = ? ORDER BY ordem', [id]),
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
      `UPDATE imoveis SET titulo=?, descricao=?, tipo=?, finalidade=?, preco=?,
        area_total=?, area_construida=?, quartos=?, suites=?, banheiros=?,
        vagas_garagem=?, endereco=?, bairro=?, cidade=?, estado=?, cep=?,
        categoria_id=?, destaque=?, novo=?, ativo=?, updated_at=NOW()
       WHERE id=?`,
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
        'SELECT COALESCE(MAX(ordem), -1) AS max FROM imovel_fotos WHERE imovel_id = ?',
        [id]
      );
      let ordem = ordemRes.rows[0].max + 1;
      for (const file of req.files) {
        try {
          const publicUrl = await uploadToSupabase(file.path, `imoveis/${file.filename}`, file.mimetype) || `/uploads/imoveis/${file.filename}`;
          await db.raw(
            `INSERT INTO imovel_fotos (imovel_id, filename, path, principal, ordem)
             VALUES (?,?,?,?,?)`,
            [id, file.filename, publicUrl, false, ordem++]
          );
          if (publicUrl !== `/uploads/imoveis/${file.filename}` && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (e) {
          console.error("Supabase upload error:", e);
        }
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
    const fotosRes = await db.raw('SELECT filename, path FROM imovel_fotos WHERE imovel_id = ?', [id]);
    for (const foto of fotosRes.rows) {
      if (foto.path && foto.path.startsWith('http')) {
        await deleteFromSupabase(foto.path);
      } else {
        const filePath = path.join(__dirname, '../public/uploads/imoveis', foto.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }
    await db.raw('DELETE FROM imoveis WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir.' });
  }
});

// POST /admin/imoveis/bulk-delete
router.post('/imoveis/bulk-delete', isAuthenticated, async (req, res) => {
  let ids = req.body.ids;
  if (!ids) return res.status(400).json({ error: 'Nenhum ID informado.' });
  if (!Array.isArray(ids)) ids = [ids];
  ids = ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (!ids.length) return res.status(400).json({ error: 'IDs inválidos.' });
  try {
    const fotosRes = await db.raw(
      `SELECT filename, path FROM imovel_fotos WHERE imovel_id = ANY(?)`,
      [ids]
    );
    for (const foto of fotosRes.rows) {
      if (foto.path && foto.path.startsWith('http')) {
        await deleteFromSupabase(foto.path);
      } else {
        const filePath = path.join(__dirname, '../public/uploads/imoveis', foto.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }
    await db.raw('DELETE FROM imoveis WHERE id = ANY(?)', [ids]);
    res.json({ success: true, deleted: ids.length });
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
      'SELECT COALESCE(MAX(ordem), -1) AS max FROM imovel_fotos WHERE imovel_id = ?',
      [id]
    );
    let ordem = ordemRes.rows[0].max + 1;
    for (const file of req.files) {
      try {
        const publicUrl = await uploadToSupabase(file.path, `imoveis/${file.filename}`, file.mimetype) || `/uploads/imoveis/${file.filename}`;
        await db.raw(
          `INSERT INTO imovel_fotos (imovel_id, filename, path, principal, ordem)
           VALUES (?,?,?,?,?)`,
          [id, file.filename, publicUrl, false, ordem++]
        );
        if (publicUrl !== `/uploads/imoveis/${file.filename}` && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (e) {
        console.error("Supabase upload error:", e);
      }
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
    const fotoRes = await db.raw('SELECT * FROM imovel_fotos WHERE id = ?', [id]);
    const foto = fotoRes.rows[0];
    if (!foto) return res.status(404).json({ error: 'Foto não encontrada.' });

    if (foto.path && foto.path.startsWith('http')) {
      await deleteFromSupabase(foto.path);
    } else {
      const filePath = path.join(__dirname, '../public/uploads/imoveis', foto.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await db.raw('DELETE FROM imovel_fotos WHERE id = ?', [id]);
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
    const fotoRes = await db.raw('SELECT imovel_id FROM imovel_fotos WHERE id = ?', [id]);
    const foto = fotoRes.rows[0];
    if (!foto) return res.status(404).json({ error: 'Foto não encontrada.' });

    await db.raw('UPDATE imovel_fotos SET principal = false WHERE imovel_id = ?', [foto.imovel_id]);
    await db.raw('UPDATE imovel_fotos SET principal = true WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro.' });
  }
});

// PUT /admin/imoveis/:id/destaque  (no máximo 1 destaque por vez)
router.put('/imoveis/:id/destaque', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    const cur = await db.raw('SELECT destaque FROM imoveis WHERE id = ?', [id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Não encontrado.' });
    const isDestaque = cur.rows[0].destaque;
    if (isDestaque) {
      // já é destaque → remove
      await db.raw('UPDATE imoveis SET destaque = false WHERE id = ?', [id]);
      res.json({ success: true, destaque: false });
    } else {
      // não é destaque → remove destaque de todos e ativa neste
      await db.raw('UPDATE imoveis SET destaque = false');
      await db.raw('UPDATE imoveis SET destaque = true WHERE id = ?', [id]);
      res.json({ success: true, destaque: true });
    }
  } catch (err) {
    res.status(500).json({ error: 'Erro.' });
  }
});

// PUT /admin/imoveis/:id/ativo
router.put('/imoveis/:id/ativo', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.raw(
      'UPDATE imoveis SET ativo = NOT ativo WHERE id = ? RETURNING ativo',
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
    await db.raw('UPDATE contatos SET lido = true WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro.' });
  }
});

// ═══════════════════════════════════════════
//  CONDOMÍNIOS
// ═══════════════════════════════════════════

const condUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/uploads/condominios')),
    filename: (req, file, cb) => {
      const { v4: uuidv4 } = require('uuid');
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
});

// GET /admin/condominios
router.get('/condominios', isAuthenticated, async (req, res) => {
  try {
    const result = await db.raw(`
      SELECT c.*,
        (SELECT path FROM condominio_fotos WHERE condominio_id = c.id AND principal = true LIMIT 1) AS foto_principal
      FROM condominios c ORDER BY c.created_at DESC
    `);
    res.render('admin/condominios-lista', {
      title: 'Condomínios — Admin',
      adminNome: req.session.adminNome,
      condominios: result.rows.map(c => ({ ...c, valor_formatado: formatarPreco(c.valor) })),
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/dashboard');
  }
});

// GET /admin/condominios/novo
router.get('/condominios/novo', isAuthenticated, (req, res) => {
  res.render('admin/condominio-form', {
    title: 'Novo Condomínio — Admin',
    adminNome: req.session.adminNome,
    condominio: null,
    fotos: [],
    errors: [],
  });
});

// POST /admin/condominios
router.post('/condominios', isAuthenticated, condUpload.array('fotos', 20), async (req, res) => {
  const { nome, valor, descricao, caracteristicas, endereco, bairro, cidade, estado, cep, sob_consulta } = req.body;
  const errors = [];
  if (!nome || nome.trim() === '') errors.push('Nome é obrigatório.');
  if (errors.length) {
    return res.render('admin/condominio-form', {
      title: 'Novo Condomínio — Admin',
      adminNome: req.session.adminNome,
      condominio: req.body,
      fotos: [],
      errors,
    });
  }
  const precoFinal = sob_consulta ? 0 : (parseFloat(valor) || 0);
  try {
    const ins = await db.raw(
      `INSERT INTO condominios (nome, valor, descricao, caracteristicas, endereco, bairro, cidade, estado, cep)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [nome.trim(), precoFinal, descricao || null, caracteristicas || null,
       endereco || null, bairro || null, cidade || 'Maringá', estado || 'PR', cep || null]
    );
    const condId = ins.rows[0].id;
    if (req.files && req.files.length) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        try {
          const publicUrl = await uploadToSupabase(file.path, `condominios/${file.filename}`, file.mimetype) || `/uploads/condominios/${file.filename}`;
          await db.raw(
            `INSERT INTO condominio_fotos (condominio_id, filename, path, principal, ordem) VALUES (?, ?, ?, ?, ?)`,
            [condId, file.filename, publicUrl, i === 0, i]
          );
          if (publicUrl !== `/uploads/condominios/${file.filename}` && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (e) {
          console.error("Supabase upload error:", e);
        }
      }
    }
    res.redirect('/admin/condominios');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/condominios');
  }
});

// GET /admin/condominios/:id/editar
router.get('/condominios/:id/editar', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    const [condRes, fotosRes] = await Promise.all([
      db.raw('SELECT * FROM condominios WHERE id = ?', [id]),
      db.raw('SELECT * FROM condominio_fotos WHERE condominio_id = ? ORDER BY ordem', [id]),
    ]);
    const condominio = condRes.rows[0];
    if (!condominio) return res.redirect('/admin/condominios');
    res.render('admin/condominio-form', {
      title: 'Editar Condomínio — Admin',
      adminNome: req.session.adminNome,
      condominio,
      fotos: fotosRes.rows,
      errors: [],
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/condominios');
  }
});

// PUT /admin/condominios/:id
router.put('/condominios/:id', isAuthenticated, condUpload.array('fotos', 20), async (req, res) => {
  const { id } = req.params;
  const { nome, valor, descricao, caracteristicas, endereco, bairro, cidade, estado, cep, sob_consulta } = req.body;
  const precoFinal = sob_consulta ? 0 : (parseFloat(valor) || 0);
  try {
    await db.raw(
      `UPDATE condominios SET nome=?, valor=?, descricao=?, caracteristicas=?, endereco=?, bairro=?, cidade=?, estado=?, cep=?, updated_at=NOW()
       WHERE id=?`,
      [nome.trim(), precoFinal, descricao || null, caracteristicas || null,
       endereco || null, bairro || null, cidade || 'Maringá', estado || 'PR', cep || null, id]
    );
    if (req.files && req.files.length) {
      const ordemRes = await db.raw('SELECT COALESCE(MAX(ordem),0)+1 AS next FROM condominio_fotos WHERE condominio_id=?', [id]);
      let ordem = ordemRes.rows[0].next;
      for (const file of req.files) {
        try {
          const publicUrl = await uploadToSupabase(file.path, `condominios/${file.filename}`, file.mimetype) || `/uploads/condominios/${file.filename}`;
          await db.raw(
            `INSERT INTO condominio_fotos (condominio_id, filename, path, principal, ordem) VALUES (?, ?, ?, false, ?)`,
            [id, file.filename, publicUrl, ordem++]
          );
          if (publicUrl !== `/uploads/condominios/${file.filename}` && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (e) {
          console.error("Supabase upload error:", e);
        }
      }
    }
    res.redirect('/admin/condominios');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/condominios');
  }
});

// DELETE /admin/condominios/:id
router.delete('/condominios/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    const fotosRes = await db.raw('SELECT filename, path FROM condominio_fotos WHERE condominio_id=?', [id]);
    for (const foto of fotosRes.rows) {
      if (foto.path && foto.path.startsWith('http')) {
        await deleteFromSupabase(foto.path);
      } else {
        const fp = path.join(__dirname, '../public/uploads/condominios', foto.filename);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
    }
    await db.raw('DELETE FROM condominios WHERE id=?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir.' });
  }
});

// DELETE /admin/condominio-fotos/:id
router.delete('/condominio-fotos/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    const r = await db.raw('SELECT * FROM condominio_fotos WHERE id=?', [id]);
    const foto = r.rows[0];
    if (!foto) return res.status(404).json({ error: 'Não encontrada.' });
    if (foto.path && foto.path.startsWith('http')) {
      await deleteFromSupabase(foto.path);
    } else {
      const fp = path.join(__dirname, '../public/uploads/condominios', foto.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await db.raw('DELETE FROM condominio_fotos WHERE id=?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir foto.' });
  }
});

module.exports = router;
