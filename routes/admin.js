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

// Converte texto por extenso de números pequenos
function numPorExtenso(str) {
  const map = { um: 1, uma: 1, dois: 2, duas: 2, três: 3, tres: 3, quatro: 4, cinco: 5,
    seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
  return map[str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')] || null;
}

function parseImovelTexto(text) {
  const r = {};
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // ── Tipo ──────────────────────────────────────────────────────────────────
  const tipoMap = {
    apartamento: 'apartamento', apto: 'apartamento',
    casa: 'casa', terreno: 'terreno',
    comercial: 'comercial', rural: 'rural', cobertura: 'cobertura',
    sala: 'comercial', loja: 'comercial', 'galpão': 'comercial', galpao: 'comercial',
  };
  // Procura tipo em qualquer palavra da primeira linha (ex: "Apartamento-Maringá-locação")
  const primeiraLinha = lines[0] || '';
  for (const [key, val] of Object.entries(tipoMap)) {
    if (new RegExp(`\\b${key}\\b`, 'i').test(primeiraLinha)) { r.tipo = val; break; }
  }

  // ── Finalidade ────────────────────────────────────────────────────────────
  r.finalidade = /loca[çc][aã]o|aluguel/i.test(text) ? 'aluguel' : 'venda';

  // ── Preço ─────────────────────────────────────────────────────────────────
  // Formatos: R$4.800,00 / R$ 4.800,00 / R$ 4800,00
  const precoM = text.match(/R\$\s*([\d.]+,\d{2})/);
  if (precoM) r.preco = parseFloat(precoM[1].replace(/\./g, '').replace(',', '.'));

  // ── Suítes: "3 Suítes" ou "Suítes (3)" ───────────────────────────────────
  let suiteM = text.match(/(\d+)\s+Su[ií]te/i) || text.match(/Su[ií]tes?\s*[:\(]\s*(\d+)/i);
  if (suiteM) r.suites = parseInt(suiteM[1]);

  // ── Quartos/Dormitórios ───────────────────────────────────────────────────
  let dormM = text.match(/(\d+)\s+(?:quarto|dormit[oó]rio)/i)
           || text.match(/(?:quarto|dormit[oó]rio)s?\s*[:\(]\s*(\d+)/i);
  if (dormM) r.quartos = parseInt(dormM[1]);
  // Se só tem suítes e nenhum quarto separado, usa suítes como quartos
  if (!r.quartos && r.suites) r.quartos = r.suites;

  // ── Banheiros ─────────────────────────────────────────────────────────────
  let banhM = text.match(/(\d+)\s+banheiro/i) || text.match(/banheiros?\s*[:\(]\s*(\d+)/i);
  if (banhM) r.banheiros = parseInt(banhM[1]);

  // ── Vagas de garagem ──────────────────────────────────────────────────────
  // "duas vagas paralelas", "2 vagas", "vagas (2)"
  let vagasM = text.match(/(\d+)\s+vaga/i);
  if (!vagasM) {
    const vagaExt = text.match(/(\w+)\s+vagas?\s+(?:paralela|coberta|simples|garagem)/i);
    if (vagaExt) { const n = numPorExtenso(vagaExt[1]); if (n) r.vagas_garagem = n; }
  } else {
    r.vagas_garagem = parseInt(vagasM[1]);
  }
  if (!r.vagas_garagem) {
    const garagemM = text.match(/garagem[:\s]*\(?(\d+)\)?/i);
    if (garagemM) r.vagas_garagem = parseInt(garagemM[1]);
  }

  // ── Área ──────────────────────────────────────────────────────────────────
  // "168 metros quadrados", "168m²", "Área: 168m²"
  const areaM = text.match(/(\d[\d.,]*)\s*(?:metros?\s+quadrados?|m[²2])/i);
  if (areaM) {
    const v = parseFloat(areaM[1].replace(/\./g, '').replace(',', '.'));
    r.area_total = v;
    r.area_construida = v;
  }
  // Padrão alternativo: "Área Total\n168 m²"
  const areaTotalM = text.match(/[AÁ]rea\s+Total\s*[\r\n:]\s*([\d.,]+)\s*m[²2]/i);
  if (areaTotalM) r.area_total = parseFloat(areaTotalM[1].replace(/\./g, '').replace(',', '.'));
  const areaConstM = text.match(/[AÁ]rea\s+Constru[ií]da\s*[\r\n:]\s*([\d.,]+)\s*m[²2]/i);
  if (areaConstM) r.area_construida = parseFloat(areaConstM[1].replace(/\./g, '').replace(',', '.'));

  // ── Localização estruturada ────────────────────────────────────────────────
  const endM    = text.match(/Endere[çc]o:\s*(.+)/i);
  const bairroM = text.match(/Bairro:\s*(.+)/i);
  const cidadeM = text.match(/Cidade:\s*(.+)/i);
  const andarM  = text.match(/Andar(?:\/Quadra)?:\s*(.+)/i);
  const aptoM   = text.match(/Apto(?:\/Lote\/Sala)?:\s*(.+)/i);

  if (endM)    r.endereco = endM[1].trim();
  if (bairroM) r.bairro   = bairroM[1].trim();
  if (andarM)  r.andar    = andarM[1].trim();
  if (aptoM)   r.apto     = aptoM[1].trim();
  if (cidadeM) {
    const cv = cidadeM[1].trim();
    const ce = cv.match(/^(.+?)\s*[-–]\s*([A-Z]{2})$/);
    if (ce) { r.cidade = ce[1].trim(); r.estado = ce[2].trim(); }
    else r.cidade = cv;
  }

  // Endereço inline se não veio da seção estruturada:
  // "Av. Horácio Racanello Filho N:6326, Centro- Maringá"
  if (!r.endereco) {
    const inlineEnd = text.match(/(?:Av\.|Rua|Avenida|Al\.|Alameda|Rod\.)\s+.+?(?=\n|$)/im);
    if (inlineEnd) r.endereco = inlineEnd[0].trim();
  }

  // ── Descrição: conteúdo antes da seção Características/Localização ────────
  const descM = text.match(/^([\s\S]+?)(?:Caracter[ií]sticas|Localiza[çc][aã]o)/i);
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
    const [totalRes, ativosRes, contatosRes, destaquesRes] = await Promise.all([
      db.raw('SELECT COUNT(*) FROM imoveis'),
      db.raw('SELECT COUNT(*) FROM imoveis WHERE ativo = true'),
      db.raw('SELECT COUNT(*) FROM contatos WHERE lido = false'),
      db.raw(
        `SELECT i.*, (SELECT path FROM imovel_fotos WHERE imovel_id = i.id AND principal = true LIMIT 1) AS foto_principal
         FROM imoveis i WHERE i.destaque = true ORDER BY COALESCE(i.ordem_destaque, 999) ASC, i.updated_at DESC LIMIT 3`
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
      destaques: destaquesRes.rows.map((i) => ({ ...i, preco_formatado: formatarPreco(i.preco) })),
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
  const [categoriasRes, destaquesCount] = await Promise.all([
    db.raw('SELECT * FROM categorias WHERE ativo = true ORDER BY ordem'),
    db.raw('SELECT COUNT(*) FROM imoveis WHERE destaque = true'),
  ]);
  res.render('admin/imovel-form', {
    title: 'Novo Imóvel — Admin',
    adminNome: req.session.adminNome,
    imovel: null,
    fotos: [],
    categorias: categoriasRes.rows,
    totalDestaques: parseInt(destaquesCount.rows[0].count),
    errors: [],
  });
});

// POST /admin/imoveis
router.post('/imoveis', isAuthenticated, (req, res, next) => {
  upload.array('fotos', 50)(req, res, (err) => {
    if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Muitos arquivos enviados. Limite: 50 fotos por imóvel.' });
    }
    if (err) return next(err);
    next();
  });
}, async (req, res) => {
  const {
    titulo, descricao, tipo, finalidade, preco,
    area_total, area_construida, quartos, suites,
    banheiros, vagas_garagem, endereco, bairro,
    cidade, estado, cep, categoria_id,
    destaque, novo, andar, apto, unidade_area,
  } = req.body;

  const errors = [];
  if (!titulo) errors.push('Título obrigatório.');
  if (!tipo) errors.push('Tipo obrigatório.');
  if (!finalidade) errors.push('Finalidade obrigatória.');
  if (preco === undefined || preco === '' || isNaN(Number(preco))) errors.push('Preço inválido.');

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
        categoria_id, destaque, novo, ativo, andar, apto, unidade_area, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,true,?,?,?,NOW())
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
        andar || null, apto || null, unidade_area || 'm2',
      ]
    );
    const imovelId = result.rows[0].id;

    if (req.files && req.files.length > 0) {
      await Promise.all(req.files.map(async (file, i) => {
        try {
          const publicUrl = await uploadToSupabase(file.path, `imoveis/${file.filename}`, file.mimetype) || `/uploads/imoveis/${file.filename}`;
          await db.raw(
            `INSERT INTO imovel_fotos (imovel_id, filename, path, principal, ordem) VALUES (?,?,?,?,?)`,
            [imovelId, file.filename, publicUrl, i === 0, i]
          );
          if (publicUrl !== `/uploads/imoveis/${file.filename}` && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        } catch (e) { console.error('Supabase upload error:', e); }
      }));
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
    const [imovelRes, fotosRes, categoriasRes, destaquesCount] = await Promise.all([
      db.raw('SELECT * FROM imoveis WHERE id = ?', [id]),
      db.raw('SELECT * FROM imovel_fotos WHERE imovel_id = ? ORDER BY ordem ASC', [id]),
      db.raw('SELECT * FROM categorias WHERE ativo = true ORDER BY ordem'),
      db.raw('SELECT COUNT(*) FROM imoveis WHERE destaque = true'),
    ]);
    const imovel = imovelRes.rows[0];
    if (!imovel) return res.redirect('/admin/imoveis');

    res.render('admin/imovel-form', {
      title: `Editar — ${imovel.titulo}`,
      adminNome: req.session.adminNome,
      imovel,
      fotos: fotosRes.rows,
      categorias: categoriasRes.rows,
      totalDestaques: parseInt(destaquesCount.rows[0].count),
      errors: [],
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/imoveis');
  }
});

// PUT /admin/imoveis/:id
router.put('/imoveis/:id', isAuthenticated, (req, res, next) => {
  upload.array('fotos', 50)(req, res, (err) => {
    if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Muitos arquivos enviados. Limite: 50 fotos por imóvel.' });
    }
    if (err) return next(err);
    next();
  });
}, async (req, res) => {
  const { id } = req.params;
  const {
    titulo, descricao, tipo, finalidade, preco,
    area_total, area_construida, quartos, suites,
    banheiros, vagas_garagem, endereco, bairro,
    cidade, estado, cep, categoria_id,
    destaque, novo, ativo, andar, apto, unidade_area,
  } = req.body;

  const errors = [];
  if (!titulo) errors.push('Título obrigatório.');
  if (!tipo) errors.push('Tipo obrigatório.');
  if (preco === undefined || preco === '' || isNaN(Number(preco))) errors.push('Preço inválido.');

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
        categoria_id=?, destaque=?, novo=?, ativo=?, andar=?, apto=?, unidade_area=?, updated_at=NOW()
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
        andar || null, apto || null, unidade_area || 'm2',
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
    const fotosRes = await db('imovel_fotos')
      .select('filename', 'path')
      .whereIn('imovel_id', ids);
      
    for (const foto of fotosRes) {
      if (foto.path && foto.path.startsWith('http')) {
        await deleteFromSupabase(foto.path);
      } else {
        const filePath = path.join(__dirname, '../public/uploads/imoveis', foto.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }
    
    await db('imoveis').whereIn('id', ids).del();
    
    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir.' });
  }
});

// POST /admin/imoveis/:id/fotos
router.post('/imoveis/:id/fotos', isAuthenticated, upload.array('fotos', 50), async (req, res) => {
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

// PUT /admin/imoveis/:id/destaque  (no máximo 3 destaques por vez)
router.put('/imoveis/:id/destaque', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    const cur = await db.raw('SELECT destaque FROM imoveis WHERE id = ?', [id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Não encontrado.' });
    
    const isDestaque = cur.rows[0].destaque;
    if (isDestaque) {
      // já é destaque → remove
      await db.raw('UPDATE imoveis SET destaque = false, ordem_destaque = 0 WHERE id = ?', [id]);
      res.json({ success: true, destaque: false });
    } else {
      // não é destaque → verifica quantos já existem
      const totalDes = await db.raw('SELECT COUNT(*) FROM imoveis WHERE destaque = true');
      if (parseInt(totalDes.rows[0].count) >= 3) {
         return res.status(400).json({ error: 'Limite Máximo Atingido: Você já possui 3 imóveis em Destaque. Remova a estrela de algum antes de destacar este.' });
      }
      
      const maxOrdem = await db.raw('SELECT COALESCE(MAX(ordem_destaque), 0) AS max FROM imoveis WHERE destaque = true');
      const nextOrdem = parseInt(maxOrdem.rows[0].max) + 1;
      // se tem menos que 3, simplesmente ativa este também
      await db.raw('UPDATE imoveis SET destaque = true, ordem_destaque = ?, updated_at = NOW() WHERE id = ?', [nextOrdem, id]);
      res.json({ success: true, destaque: true });
    }
  } catch (err) {
    res.status(500).json({ error: 'Erro.' });
  }
});

// POST /admin/imoveis/reorder-destaques
router.post('/imoveis/reorder-destaques', isAuthenticated, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'IDs inválidos.' });

  try {
    for (let i = 0; i < ids.length; i++) {
      await db.raw('UPDATE imoveis SET ordem_destaque = ? WHERE id = ?', [i + 1, ids[i]]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Erro reordenando destaques:', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// GET /admin/imoveis-search
router.get('/imoveis-search', isAuthenticated, async (req, res) => {
  const q = req.query.q || '';
  try {
    const result = await db.raw(
      `SELECT i.id, i.titulo, i.preco, 
        (SELECT path FROM imovel_fotos WHERE imovel_id = i.id AND principal = true LIMIT 1) AS foto_principal
       FROM imoveis i
       WHERE i.ativo = true AND i.destaque = false AND i.titulo ILIKE ?
       ORDER BY i.created_at DESC LIMIT 10`,
      [`%${q}%`]
    );
    res.json({ success: true, imoveis: result.rows.map(i => ({ ...i, preco_formatado: formatarPreco(i.preco) })) });
  } catch (err) {
    console.error('Erro ao buscar imóveis:', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// POST /admin/imoveis/substituir-destaque
router.post('/imoveis/substituir-destaque', isAuthenticated, async (req, res) => {
  const { oldId, newId } = req.body;
  if (!oldId || !newId) return res.status(400).json({ error: 'IDs ausentes.' });

  try {
    const oldInfo = await db.raw('SELECT ordem_destaque FROM imoveis WHERE id = ?', [oldId]);
    const ordem = oldInfo.rows[0] ? oldInfo.rows[0].ordem_destaque : 0;

    await db.raw('UPDATE imoveis SET destaque = false, ordem_destaque = 0 WHERE id = ?', [oldId]);
    await db.raw('UPDATE imoveis SET destaque = true, ordem_destaque = ? WHERE id = ?', [ordem, newId]);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao substituir destaque:', err);
    res.status(500).json({ error: 'Erro interno.' });
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
      await Promise.all(req.files.map(async (file, i) => {
        try {
          const publicUrl = await uploadToSupabase(file.path, `condominios/${file.filename}`, file.mimetype) || `/uploads/condominios/${file.filename}`;
          await db.raw(
            `INSERT INTO condominio_fotos (condominio_id, filename, path, principal, ordem) VALUES (?, ?, ?, ?, ?)`,
            [condId, file.filename, publicUrl, i === 0, i]
          );
          if (publicUrl !== `/uploads/condominios/${file.filename}` && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        } catch (e) { console.error('Supabase upload error:', e); }
      }));
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
      const ordemBase = ordemRes.rows[0].next;
      await Promise.all(req.files.map(async (file, i) => {
        try {
          const publicUrl = await uploadToSupabase(file.path, `condominios/${file.filename}`, file.mimetype) || `/uploads/condominios/${file.filename}`;
          await db.raw(
            `INSERT INTO condominio_fotos (condominio_id, filename, path, principal, ordem) VALUES (?, ?, ?, false, ?)`,
            [id, file.filename, publicUrl, ordemBase + i]
          );
          if (publicUrl !== `/uploads/condominios/${file.filename}` && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        } catch (e) { console.error('Supabase upload error:', e); }
      }));
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
