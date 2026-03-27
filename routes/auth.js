const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../db');

// GET /admin/login
router.get('/admin/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin/dashboard');
  res.render('admin/login', { title: 'Login — Tradição Imóveis', error: null });
});

// POST /admin/login
router.post('/admin/login', async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.render('admin/login', {
      title: 'Login — Tradição Imóveis',
      error: 'Preencha todos os campos.',
    });
  }

  try {
    const result = await db.raw('SELECT * FROM admin_users WHERE email = $1 LIMIT 1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.render('admin/login', {
        title: 'Login — Tradição Imóveis',
        error: 'Credenciais inválidas.',
      });
    }

    const match = await bcrypt.compare(senha, user.senha);
    if (!match) {
      return res.render('admin/login', {
        title: 'Login — Tradição Imóveis',
        error: 'Credenciais inválidas.',
      });
    }

    req.session.adminId = user.id;
    req.session.adminNome = user.nome;
    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('Erro no login:', err);
    res.render('admin/login', {
      title: 'Login — Tradição Imóveis',
      error: 'Erro interno. Tente novamente.',
    });
  }
});

// GET /admin/logout
router.get('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

module.exports = router;
