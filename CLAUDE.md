# Instruções para o Claude Code

Você é o desenvolvedor responsável por construir o projeto **Tradição Imóveis** — um site completo de imobiliária.

## Sua Tarefa

Leia o arquivo `project.md` na raiz deste projeto. Ele contém a especificação COMPLETA dividida em 3 agentes:

1. **🏗️ Agente 1 — Banco de Dados:** `knexfile.js`, `migrations/`, `seeds/`, `.env.example`
2. **⚙️ Agente 2 — Backend:** `server.js`, `package.json`, `middleware/`, `routes/`
3. **🎨 Agente 3 — Frontend:** `public/css/`, `public/js/`, `views/`

## Ordem de Execução

Execute na seguinte ordem, **um agente por vez**, validando cada fase antes de avançar:

### Fase 1 — Setup + Banco de Dados (Agente 1)
1. Rode `npm init -y` e instale TODAS as dependências listadas no project.md
2. Crie o `knexfile.js` apontando para PostgreSQL via variáveis de ambiente
3. Crie o `.env.example` com todas as variáveis necessárias
4. Crie TODAS as 5 migrations na pasta `migrations/` seguindo EXATAMENTE o schema SQL do project.md
5. Crie o seed `001_admin_default.js` com admin padrão + categorias iniciais
6. **Valide:** rode `npx knex migrate:latest` e `npx knex seed:run` — deve funcionar sem erros

### Fase 2 — Backend (Agente 2)
1. Crie `server.js` com Express, EJS, sessions, static files — conforme project.md
2. Crie `middleware/auth.js` (verificação de sessão) e `middleware/upload.js` (Multer config)
3. Crie `routes/auth.js` — login/logout com bcrypt
4. Crie `routes/public.js` — renderização das páginas públicas com dados do banco
5. Crie `routes/admin.js` — CRUD completo de imóveis com upload de fotos
6. Crie `routes/api.js` — endpoints JSON para filtros dinâmicos
7. **Valide:** rode `node server.js` — deve iniciar sem erros na porta 3000

### Fase 3 — Frontend (Agente 3)
1. Crie os 6 arquivos CSS em `public/css/` implementando fielmente o design system do project.md
2. Crie os partials EJS (`head.ejs`, `header.ejs`, `footer.ejs`)
3. Crie as 5 views públicas: `home.ejs`, `imoveis.ejs`, `imovel-detalhes.ejs`, `contato.ejs`, `sobre.ejs`
4. Crie as 4 views admin: `login.ejs`, `dashboard.ejs`, `imoveis-lista.ejs`, `imovel-form.ejs`
5. Crie os 5 arquivos JS em `public/js/` — main, imoveis, galeria, contato, admin
6. Crie as pastas vazias: `public/uploads/imoveis/` e `public/images/`
7. **Valide:** abra `http://localhost:3000` no browser — todas as páginas devem renderizar com o design correto

## Regras OBRIGATÓRIAS

- **Siga o project.md à risca.** Não invente, não simplifique, não omita nada.
- **Design system fiel:** use TODAS as CSS custom properties, Newsreader + Manrope, sem bordas sólidas entre seções, sem #000 ou #FFF puros.
- **Queries parametrizadas:** ($1, $2...) em TODAS as queries SQL — sem concatenação de strings.
- **Validação server-side** em todos os endpoints POST/PUT.
- **Código organizado:** cada arquivo tem uma responsabilidade clara.
- **Após cada fase concluída**, faça commit e push:
  ```bash
  git add -A && git commit -m "mensagem descritiva" && git push origin main
  ```

## Começar

Leia `project.md` agora e comece pela Fase 1. Não peça confirmação, apenas execute.
