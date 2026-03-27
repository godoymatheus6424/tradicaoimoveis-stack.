# Tradição Imóveis — Projeto Completo

Site completo de imobiliária com Node.js + Express + PostgreSQL + EJS + CSS/JS puro.

---

# 🏗️ AGENTE 1 — BANCO DE DADOS

**Responsabilidade:** Criar toda a camada de dados — configuração do Knex, migrations, seeds e schema PostgreSQL.

## Arquivos a criar

```
knexfile.js
.env.example
migrations/
  ├── 001_create_admin_users.js
  ├── 002_create_categorias.js
  ├── 003_create_imoveis.js
  ├── 004_create_imovel_fotos.js
  └── 005_create_contatos.js
seeds/
  └── 001_admin_default.js
```

## Schema PostgreSQL

### `admin_users`
```sql
CREATE TABLE admin_users (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(200) UNIQUE NOT NULL,
  senha VARCHAR(255) NOT NULL,  -- hash bcrypt
  created_at TIMESTAMP DEFAULT NOW()
);
```

### `categorias`
```sql
CREATE TABLE categorias (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,          -- "Casas de Campo", "Litoral", "Penthouses", "Investimentos Corporativos"
  slug VARCHAR(100) UNIQUE NOT NULL,
  subtitulo VARCHAR(50),               -- "Tradição", "Exclusivo", "Moderno"
  imagem_url VARCHAR(500),
  ordem INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT true
);
```

### `imoveis`
```sql
CREATE TABLE imoveis (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(200) NOT NULL,
  descricao TEXT,
  tipo VARCHAR(50) NOT NULL,                     -- casa, apartamento, terreno, comercial, rural, cobertura
  finalidade VARCHAR(20) NOT NULL DEFAULT 'venda', -- venda, aluguel
  preco DECIMAL(14,2) NOT NULL,
  area_total DECIMAL(10,2),
  area_construida DECIMAL(10,2),
  quartos INTEGER DEFAULT 0,
  suites INTEGER DEFAULT 0,
  banheiros INTEGER DEFAULT 0,
  vagas_garagem INTEGER DEFAULT 0,
  endereco VARCHAR(300),
  bairro VARCHAR(100),
  cidade VARCHAR(100) DEFAULT 'Maringá',
  estado VARCHAR(2) DEFAULT 'PR',
  cep VARCHAR(10),
  categoria_id INTEGER REFERENCES categorias(id),
  destaque BOOLEAN DEFAULT false,
  novo BOOLEAN DEFAULT false,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### `imovel_fotos`
```sql
CREATE TABLE imovel_fotos (
  id SERIAL PRIMARY KEY,
  imovel_id INTEGER REFERENCES imoveis(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  principal BOOLEAN DEFAULT false,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### `contatos`
```sql
CREATE TABLE contatos (
  id SERIAL PRIMARY KEY,
  imovel_id INTEGER REFERENCES imoveis(id) ON DELETE SET NULL,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(200) NOT NULL,
  telefone VARCHAR(20),
  mensagem TEXT,
  lido BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Seeds Padrão

- **Admin:** `admin@tradicao.com` / `admin123` (hash bcrypt)
- **Categorias:** Casas de Campo (slug: casas-de-campo, subtitulo: "Tradição"), Litoral (slug: litoral, subtitulo: "Exclusivo"), Penthouses (slug: penthouses, subtitulo: "Moderno"), Investimentos Corporativos (slug: investimentos-corporativos, subtitulo: "Estratégico")

## Variáveis de Ambiente (.env.example)
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=
DB_NAME=tradicao_imoveis
SESSION_SECRET=tradicao-secret-key-change-me
PORT=3000
```

---

# ⚙️ AGENTE 2 — BACKEND (SERVIDOR)

**Responsabilidade:** Criar `server.js`, middlewares, todas as rotas (públicas, admin, auth, API).

## Arquivos a criar

```
server.js
package.json
middleware/
  ├── auth.js
  └── upload.js
routes/
  ├── public.js
  ├── admin.js
  ├── auth.js
  └── api.js
```

## Dependências (package.json)

```json
{
  "dependencies": {
    "express": "^4.18",
    "ejs": "^3.1",
    "pg": "^8.11",
    "knex": "^3.1",
    "bcrypt": "^5.1",
    "express-session": "^1.17",
    "connect-pg-simple": "^9.0",
    "multer": "^1.4",
    "uuid": "^9.0",
    "dotenv": "^16.3"
  },
  "devDependencies": {
    "nodemon": "^3.0"
  },
  "scripts": {
    "dev": "nodemon server.js",
    "start": "node server.js"
  }
}
```

## server.js
- Express com EJS como view engine
- `express-session` com `connect-pg-simple` para sessões no PostgreSQL
- `express.static('public')` para arquivos estáticos
- `express.urlencoded` e `express.json` para parsing
- Montar rotas: `/` → public, `/admin` → admin, `/auth` → auth, `/api` → api
- Variáveis globais EJS: `currentPath` para marcar link ativo no header

## Middleware

### `auth.js`
- `isAuthenticated(req, res, next)` — verifica `req.session.adminId`, redireciona para `/admin/login` se não logado

### `upload.js`
- Multer configurado com `diskStorage` salvando em `public/uploads/imoveis/`
- Nomes únicos com uuid: `{uuid}-{originalname}`
- Filtro: aceitar apenas jpg, jpeg, png, webp
- Limite: 10MB por arquivo, máximo 20 arquivos por upload

## Rotas

### `routes/auth.js`
```
GET  /admin/login     → renderiza admin/login.ejs
POST /admin/login     → valida email/senha com bcrypt, cria sessão
GET  /admin/logout    → destrói sessão, redireciona para /admin/login
```

### `routes/public.js`
```
GET  /                → renderiza home.ejs (com imóvel destaque + categorias do banco)
GET  /imoveis         → renderiza imoveis.ejs (lista paginada)
GET  /imovel/:id      → renderiza imovel-detalhes.ejs (com fotos)
GET  /contato         → renderiza contato.ejs
GET  /sobre           → renderiza sobre.ejs
```

### `routes/admin.js` (protegido por auth middleware)
```
GET    /admin/dashboard              → métricas: total imóveis, ativos, contatos não lidos
GET    /admin/imoveis                → lista de imóveis
GET    /admin/imoveis/novo           → form novo imóvel
POST   /admin/imoveis                → criar imóvel + upload fotos
GET    /admin/imoveis/:id/editar     → form editar imóvel
PUT    /admin/imoveis/:id            → atualizar imóvel
DELETE /admin/imoveis/:id            → excluir imóvel
POST   /admin/imoveis/:id/fotos     → adicionar fotos
DELETE /admin/fotos/:id              → excluir foto individual
PUT    /admin/fotos/:id/principal    → definir foto como principal
PUT    /admin/imoveis/:id/destaque   → toggle destaque
PUT    /admin/imoveis/:id/ativo      → toggle ativo
GET    /admin/contatos               → lista contatos
PUT    /admin/contatos/:id/lido      → marcar como lido
```

### `routes/api.js`
```
GET  /api/imoveis           → JSON com filtros (query: tipo, finalidade, preco_min, preco_max, quartos, cidade, bairro, page, limit)
GET  /api/imoveis/:id       → JSON detalhes + fotos
GET  /api/imoveis/destaques → JSON imóveis destaque
GET  /api/categorias        → JSON categorias ativas
POST /api/contatos          → salvar contato no banco
```

## Regras Backend
- Todas as queries parametrizadas ($1, $2...) — sem SQL injection
- Validação server-side em todos os POST/PUT
- Formatação de preço BRL no servidor antes de enviar para views
- Paginação: 12 imóveis por página por padrão

---

# 🎨 AGENTE 3 — FRONTEND (CSS + VIEWS + JS)

**Responsabilidade:** Criar todo o design system CSS, views EJS e JavaScript do client-side.

## Arquivos a criar

```
public/
  ├── css/
  │   ├── variables.css
  │   ├── base.css
  │   ├── components.css
  │   ├── layout.css
  │   ├── pages.css
  │   └── admin.css
  ├── js/
  │   ├── main.js
  │   ├── imoveis.js
  │   ├── galeria.js
  │   ├── contato.js
  │   └── admin.js
  ├── uploads/imoveis/    (pasta vazia, recebe uploads)
  └── images/             (assets estáticos)
views/
  ├── partials/
  │   ├── head.ejs
  │   ├── header.ejs
  │   └── footer.ejs
  ├── home.ejs
  ├── imoveis.ejs
  ├── imovel-detalhes.ejs
  ├── contato.ejs
  ├── sobre.ejs
  └── admin/
      ├── login.ejs
      ├── dashboard.ejs
      ├── imoveis-lista.ejs
      └── imovel-form.ejs
```

## Design System

### Paleta de Cores
```css
:root {
  --surface: #fef9f1;
  --surface-dim: #ded9d2;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #f8f3eb;
  --surface-container: #f2ede5;
  --surface-container-high: #ece8e0;
  --surface-container-highest: #e7e2da;
  --primary: #690008;
  --primary-container: #8b1a1a;
  --on-primary: #ffffff;
  --on-primary-container: #ff9a91;
  --on-surface: #1d1c17;
  --on-surface-variant: #58413f;
  --secondary: #5f5e5e;
  --on-secondary: #ffffff;
  --secondary-container: #e4e2e1;
  --tertiary: #472a07;
  --tertiary-container: #61401b;
  --on-tertiary-fixed: #2c1600;
  --outline: #8c716e;
  --outline-variant: #e0bfbc;
  --error: #ba1a1a;
  --inverse-surface: #32302b;
  --inverse-on-surface: #f5f0e8;
}
```

### Tipografia
- **Newsreader** (serif) — headlines, títulos, preços
- **Manrope** (sans-serif) — body, labels, botões
- Escala: display-lg 3.5rem, headline-lg 3rem, headline-md 1.75rem, title-lg 1.25rem, body-md 1rem, label-md 0.75rem, label-sm 0.625rem

### Regras de Design OBRIGATÓRIAS
1. **PROIBIDO** `border: 1px solid` para separar seções — usar mudanças de fundo + espaço
2. **PROIBIDO** `#000000` ou `#FFFFFF` puros — usar `--on-surface` e `--surface`
3. **Botões primários:** gradiente `linear-gradient(135deg, #690008, #8b1a1a)`, border-radius 0.125rem, uppercase, letter-spacing 0.2em
4. **Botões secundários:** sem fundo, borda outline-variant 20%
5. **Sombras:** ambient — blur 40-60px, opacidade 5%
6. **Cards assimétricos:** imagem 60%, painel 40% com overlap -12px
7. **Heritage Badges:** fundo tertiary-container, uppercase, tracking widest
8. **Inputs:** fundo surface-container-high, borda inferior apenas, focus muda para primary 2px

## Páginas — Layout Exato

### HEADER (fixo, todas as páginas)
- **Barra de utilidades:** fundo `--primary`, texto 10px branco uppercase — "Plantão: (44) 3246-7100 | WhatsApp: (44) 99887-0006 | E-mail: atendimento@tradicaoimoveismga.com.br" — direita: "CRECI 7806-J"
- **Navegação:** fundo surface 80% + backdrop-blur 20px — logo Newsreader italic — links HOME | NOSSOS IMÓVEIS | FALE CONOSCO | SOBRE — botão "Agendar Visita"

### HOME (/)
- **Hero:** fullscreen, overlay gradiente, título "Encontre onde sua *história* começa" (Newsreader 5rem), barra vermelha decorativa, subtítulo Manrope light, botão "VER IMÓVEIS", seta dupla animada
- **Imóvel em Destaque:** card assimétrico (imagem 8col / detalhes 4col com overlap -3rem), badge "NOVA LISTAGEM", specs grid 3col, preço Newsreader 2.5rem, botão "SAIBA MAIS" — dados dinâmicos `destaque=true`
- **Nossa Curadoria:** bento grid assimétrico com categorias do banco, hover zoom, overlay gradiente
- **Footer:** grid 4col — logo + links + legal + newsletter

### LISTAGEM (/imoveis)
- Filtros: tipo, finalidade, preço, cidade, quartos — via fetch `/api/imoveis`
- Grid: 3col desktop, 2col tablet, 1col mobile
- Cards com foto, badge, specs, preço, botão "Saiba Mais"
- Paginação

### DETALHES (/imovel/:id)
- Galeria lightbox com thumbnails
- Specs grid, preço, descrição, localização
- Sidebar: botão WhatsApp (wa.me/5544998870006), agendar visita, form rápido

### CONTATO (/contato)
- Form: nome, email, telefone, imóvel (select opcional), mensagem — salva em `contatos`

### SOBRE (/sobre)
- Institucional: desde 1994, valores, CRECI

### ADMIN — Login, Dashboard, CRUD Imóveis, Contatos
- Estilo minimalista seguindo design system
- Dashboard com métricas
- CRUD completo com upload drag-and-drop de fotos

## JavaScript Client-Side

### `main.js` — Scroll suave, menu mobile hamburger, animações fade-in ao viewport (IntersectionObserver)
### `imoveis.js` — Fetch API para filtros dinâmicos, renderização de cards, paginação
### `galeria.js` — Lightbox fullscreen com navegação por setas
### `contato.js` — Validação de campos + submit via fetch
### `admin.js` — Preview de imagens, drag-and-drop upload, toggle destaque/ativo via fetch

## Responsividade
- **Desktop:** layout completo com grids assimétricos e overlaps
- **Tablet (≤1024px):** 2 colunas, hero texto menor
- **Mobile (≤768px):** hamburger, coluna única, card destaque sem overlap, bento grid 1 coluna

---

# 🚀 PARA RODAR

```bash
npm install
createdb tradicao_imoveis
cp .env.example .env    # editar com credenciais PostgreSQL
npx knex migrate:latest
npx knex seed:run
npm run dev
```
