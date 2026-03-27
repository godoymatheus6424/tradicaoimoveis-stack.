require('dotenv').config();
const express = require('express');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const path = require('path');
const knex = require('./db');

const app = express();
const PgSession = connectPgSimple(session);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Sessions
app.use(
  session({
    store: new PgSession({
      knex: knex,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || 'tradicao-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 24h
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

// Global EJS variables
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.session = req.session;
  next();
});

// Routes
app.use('/', require('./routes/public'));
app.use('/auth', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));
app.use('/api', require('./routes/api'));

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Página não encontrada' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Tradição Imóveis rodando em http://localhost:${PORT}`);
});

module.exports = app;
