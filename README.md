# grana — sistema pessoal de finanças

Stack: React + Vite + Supabase

---

## Setup

### 1. Supabase

1. Crie um projeto em https://supabase.com (gratuito)
2. Vá em **SQL Editor → New query**, cole o conteúdo de `schema.sql` e execute
3. Em **Project Settings → API**, copie:
   - **Project URL**
   - **anon/public key**
4. Em **Authentication → Providers → Email**, desative "Confirm email" (assim não precisa de verificação)

### 2. Projeto local

```bash
cp .env.example .env
# edite .env com suas chaves do Supabase
npm install
npm run dev
```

Acesse http://localhost:5173

### 3. Deploy (Vercel — gratuito)

```bash
npm install -g vercel
vercel
# siga o wizard, defina as env vars VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
```

Ou Netlify: arraste a pasta `dist/` após `npm run build`.

---

## Estrutura

```
src/
  lib/supabase.js       — cliente Supabase
  App.jsx               — auth state global
  components/
    Auth.jsx            — login / cadastro
    Dashboard.jsx       — caixas + transações
schema.sql              — tabelas + RLS policies
```

## Funcionalidades

- Autenticação por usuário/senha (sem email de confirmação)
- Caixas financeiras independentes por usuário
- Transações com valor e descrição
- Saldo, total de entradas e saídas por caixa
- Row Level Security — cada usuário vê apenas seus dados
