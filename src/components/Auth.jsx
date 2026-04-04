import { useState } from 'react'
import { supabase } from '../lib/supabase'
import s from './Auth.module.css'

export default function Auth() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Supabase auth uses email — we use username@grana.local as the email internally
  const toEmail = u => `${u.trim().toLowerCase()}@grana.local`

  async function handle(mode) {
    setError('')
    const u = username.trim()
    const p = password
    if (!u || !p) { setError('preencha os campos'); return }
    if (p.length < 6) { setError('senha mínima: 6 caracteres'); return }
    setLoading(true)

    if (mode === 'login') {
      const { error: e } = await supabase.auth.signInWithPassword({ email: toEmail(u), password: p })
      if (e) setError(e.message.includes('Invalid') ? 'usuário ou senha incorretos' : e.message)
    } else {
      const { error: e } = await supabase.auth.signUp({
        email: toEmail(u),
        password: p,
        options: { data: { username: u } }
      })
      if (e) setError(e.message.includes('already') ? 'usuário já existe' : e.message)
    }
    setLoading(false)
  }

  return (
    <div className={s.wrap}>
      <div className={s.box}>
        <h1 className={s.title}>// ENCAIXE</h1>
        <p className={s.sub}>sistema pessoal de finanças</p>

        <input
          className={s.input}
          placeholder="usuário"
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && document.getElementById('pass').focus()}
          autoComplete="username"
          autoCapitalize="none"
        />
        <input
          id="pass"
          className={s.input}
          type="password"
          placeholder="senha"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handle('login')}
          autoComplete="current-password"
        />

        {error && <p className={s.err}>{error}</p>}

        <button className={`${s.btn} ${s.primary}`} onClick={() => handle('login')} disabled={loading}>
          {loading ? '...' : 'ENTRAR'}
        </button>
        <button className={s.btn} onClick={() => handle('register')} disabled={loading}>
          {loading ? '...' : 'CRIAR CONTA'}
        </button>
      </div>
    </div>
  )
}
