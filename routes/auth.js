const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const db = require('../db');

// Rate limiter: max 5 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).render('admin/login', {
      title: 'Login — Tradição Imóveis',
      error: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.',
    });
  },
});

// GET /admin/login
router.get('/admin/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin/dashboard');
  res.render('admin/login', { title: 'Login — Tradição Imóveis', error: null });
});

// POST /admin/login
router.post('/admin/login', loginLimiter, async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.render('admin/login', {
      title: 'Login — Tradição Imóveis',
      error: 'Preencha todos os campos.',
    });
  }

  try {
    const result = await db.raw('SELECT * FROM admin_users WHERE email = ? LIMIT 1', [email]);
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

    // Regenerate session to prevent session fixation attacks
    req.session.regenerate((err) => {
      if (err) {
        console.error('Erro ao regenerar sessão:', err);
        return res.render('admin/login', {
          title: 'Login — Tradição Imóveis',
          error: 'Erro interno. Tente novamente.',
        });
      }
      req.session.adminId = user.id;
      req.session.adminNome = user.nome;
      res.redirect('/admin/dashboard');
    });
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
