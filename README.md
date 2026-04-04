# encaixe

Sistema pessoal de finanças minimalista. Organize seu dinheiro em **caixas** independentes.

![stack](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
![stack](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite)
![stack](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase)
![license](https://img.shields.io/badge/license-MIT-yellow?style=flat-square)

---

## funcionalidades

- **caixas** — separações financeiras independentes (pessoal, viagem, empresa…)
- **lançamentos** — entrada ou saída com valor e descrição
- **saldo em tempo real** — total, entradas e saídas por caixa
- **autenticação** — usuário e senha, sem confirmação de e-mail
- **dados online** — PostgreSQL via Supabase, Row Level Security por usuário
- **mobile-first** — funciona bem em qualquer tela

---

## stack

| camada | tecnologia |
|--------|-----------|
| frontend | React 18 + Vite |
| estilo | CSS Modules, tema Gruvbox |
| banco | Supabase (PostgreSQL) |
| auth | Supabase Auth |
| deploy | Vercel / Netlify (estático) |

---

## como rodar

### 1. Supabase

1. Crie um projeto gratuito em [supabase.com](https://supabase.com)
2. Vá em **SQL Editor → New query**, cole o conteúdo de [`schema.sql`](./schema.sql) e execute
3. Em **Authentication → Providers → Email**, desative **"Confirm email"**
4. Copie as chaves em **Project Settings → API**:
   - `Project URL`
   - `anon / public key`

### 2. Variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env`:

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Instalar e rodar

```bash
npm install
npm run dev
```

Acesse [http://localhost:5173](http://localhost:5173)

---

## deploy

### Vercel (recomendado)

```bash
npx vercel
```

Defina as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no wizard ou pelo painel da Vercel.

### Netlify

```bash
npm run build
# arraste a pasta dist/ no painel do Netlify
# ou via CLI:
npx netlify deploy --prod --dir dist
```

---

## banco de dados

O arquivo [`schema.sql`](./schema.sql) cria duas tabelas com Row Level Security habilitada — cada usuário acessa apenas seus próprios dados.

```
boxes
  id          uuid  PK
  user_id     uuid  FK → auth.users
  name        text
  created_at  timestamptz

transactions
  id          uuid  PK
  box_id      uuid  FK → boxes
  user_id     uuid  FK → auth.users
  amount      numeric(12,2)   — positivo = entrada, negativo = saída
  description text
  created_at  timestamptz
```

---

## estrutura do projeto

```
grana/
├── index.html
├── schema.sql              # rodar no Supabase SQL Editor
├── .env.example
├── vite.config.js
└── src/
    ├── main.jsx
    ├── App.jsx              # gerencia sessão de auth
    ├── index.css            # variáveis globais gruvbox
    ├── lib/
    │   └── supabase.js      # cliente Supabase
    └── components/
        ├── Auth.jsx         # login / cadastro
        ├── Auth.module.css
        ├── Dashboard.jsx    # caixas + transações
        └── Dashboard.module.css
```

---

## licença

MIT
