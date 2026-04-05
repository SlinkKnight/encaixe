import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { supabase } from '../lib/supabase'
import s from './Dashboard.module.css'

const fmt = n =>
  'R$\u00a0' + Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const timeAgo = ts => {
  const m = Math.floor((Date.now() - new Date(ts)) / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const parseAmt = str => parseFloat(String(str).replace(',', '.'))
const sum = (arr, fn) => arr.reduce((a, x) => a + fn(x), 0)

// ── TxRow ─────────────────────────────────────────────────────────────────────
const TxRow = memo(({ t, onToggle, onDel }) => {
  const overdue = t.pending && !t.settled && t.due_date && new Date(t.due_date + 'T12:00') < new Date()
  const cls = t.pending
    ? `${s.txItem} ${overdue ? s.txOverdue : s.txPending}`
    : `${s.txItem} ${t.amount > 0 ? s.txIn : s.txOut}`

  return (
    <div className={cls}>
      {t.pending && (
        <button
          className={`${s.checkbox}${t.settled ? ' ' + s.checked : ''}`}
          onPointerDown={e => { e.stopPropagation(); onToggle(t) }}
        >{t.settled ? '✓' : ''}</button>
      )}
      <div className={`${s.txLeft}${t.settled ? ' ' + s.settled : ''}`}>
        <span className={s.txDesc}>{t.description || '—'}</span>
        <span className={s.txMeta}>
          {t.debtor ? `${t.debtor} · ` : ''}
          {timeAgo(t.created_at)}
          {t.due_date ? ` · ${new Date(t.due_date + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : ''}
        </span>
      </div>
      <span className={`${s.txAmt} ${
        t.pending
          ? t.settled ? s.inColor : overdue ? s.outColor : s.pendingColor
          : t.amount > 0 ? s.inColor : s.outColor
      }`}>
        {t.pending ? '' : (t.amount > 0 ? '+' : '−')}{fmt(t.amount)}
      </span>
      <button className={s.delBtn} onPointerDown={e => { e.stopPropagation(); onDel(t.id) }}>×</button>
    </div>
  )
})

// ── BoxCard ───────────────────────────────────────────────────────────────────
function BoxCard({ box, uid, onDelete, focused, onFocus, cardRef }) {
  const [txs, setTxs]           = useState([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [debtOpen, setDebtOpen] = useState(false)
  const [amount, setAmount]     = useState('')
  const [desc,   setDesc]       = useState('')
  const [debtor, setDebtor]     = useState('')
  const [due,    setDue]        = useState('')
  const [err,    setErr]        = useState('')
  const amountRef = useRef(null)
  const descRef   = useRef(null)

  // load once on mount — no deps that change
  useEffect(() => {
    let cancelled = false
    supabase
      .from('transactions')
      .select('id,amount,description,pending,settled,debtor,due_date,created_at')
      .eq('box_id', box.id)
      .order('pending', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => { if (!cancelled) { setTxs(data ?? []); setLoading(false) } })
    return () => { cancelled = true }
  }, [box.id])

  useEffect(() => { if (focused) amountRef.current?.focus() }, [focused])

  const resetForm = () => {
    setAmount(''); setDesc(''); setDebtor(''); setDue(''); setErr('')
    amountRef.current?.focus()
  }

  const addTx = useCallback(async (sign) => {
    // sign=1 entrada, sign=-1 saída, sign=0 dívida
    // if entrada/saída clicked while debtOpen → just close debt panel, reset, don't error
    if (sign !== 0 && debtOpen) {
      setDebtOpen(false); resetForm(); return
    }
    setErr('')
    const v = parseAmt(amount)
    if (!amount || isNaN(v) || v <= 0) {
      setErr('valor inválido')
      amountRef.current?.focus()
      return
    }

    const newTx = sign === 0
      ? { id: crypto.randomUUID(), box_id: box.id, user_id: uid, amount: v,
          description: desc.trim() || null, debtor: debtor.trim() || null,
          due_date: due || null, pending: true, settled: false,
          created_at: new Date().toISOString() }
      : { id: crypto.randomUUID(), box_id: box.id, user_id: uid, amount: sign * v,
          description: desc.trim() || null, pending: false, settled: false,
          created_at: new Date().toISOString() }

    // optimistic update — instant UI
    setTxs(prev => [newTx, ...prev])
    resetForm()
    if (sign === 0) setDebtOpen(false)

    const { error } = await supabase.from('transactions').insert({
      box_id: newTx.box_id, user_id: newTx.user_id, amount: newTx.amount,
      description: newTx.description, debtor: newTx.debtor, due_date: newTx.due_date,
      pending: newTx.pending, settled: newTx.settled,
    })
    if (error) {
      // rollback
      setTxs(prev => prev.filter(t => t.id !== newTx.id))
      setErr('erro ao salvar')
    }
  }, [amount, desc, debtor, due, debtOpen, box.id, uid])

  const toggleDebt = useCallback(async (t) => {
    const settled = !t.settled
    // optimistic
    setTxs(prev => prev.map(x => x.id === t.id ? { ...x, settled } : x))
    const { error } = await supabase.from('transactions').update({ settled }).eq('id', t.id)
    if (error) setTxs(prev => prev.map(x => x.id === t.id ? { ...x, settled: t.settled } : x))
  }, [])

  const delTx = useCallback(async (id) => {
    // optimistic
    setTxs(prev => prev.filter(x => x.id !== id))
    await supabase.from('transactions').delete().eq('id', id).eq('user_id', uid)
  }, [uid])

  // derive display values
  const normalTxs    = txs.filter(t => !t.pending)
  const debtTxs      = txs.filter(t => t.pending)
  const pendingDebts = debtTxs.filter(t => !t.settled)
  const settledDebts = debtTxs.filter(t => t.settled)

  const income       = sum(normalTxs, t => t.amount > 0 ? t.amount : 0)
  const expense      = sum(normalTxs, t => t.amount < 0 ? t.amount : 0)
  const received     = sum(settledDebts, t => t.amount)   // settled debts count in balance
  const pendingTotal = sum(pendingDebts, t => t.amount)
  const bal          = income + expense + received         // FIX: include received debts
  const overdueN     = pendingDebts.filter(t => t.due_date && new Date(t.due_date + 'T12:00') < new Date()).length

  const visibleNormal = expanded ? normalTxs : normalTxs.slice(0, 3)
  const extra         = normalTxs.length - 3

  return (
    <div
      ref={cardRef}
      className={`${s.boxCard}${focused ? ' ' + s.focused : ''}`}
      onClick={onFocus}
    >
      <div className={s.balCard}>
        <div>
          <div className={s.balLabel}>{box.name.toUpperCase()}</div>
          <div className={`${s.balAmount} ${bal > 0 ? s.pos : bal < 0 ? s.neg : s.zero}`}>
            {bal < 0 ? '−' : ''}{fmt(bal)}
          </div>
        </div>
        <div className={s.balStats}>
          <div>+ <span className={s.inColor}>{fmt(income + received)}</span></div>
          <div>− <span className={s.outColor}>{fmt(Math.abs(expense))}</span></div>
          {pendingTotal > 0 && (
            <div>
              {overdueN > 0 && <span className={s.outColor}>{overdueN} venc. </span>}
              ○ <span className={s.pendingColor}>{fmt(pendingTotal)}</span>
            </div>
          )}
        </div>
      </div>

      <div className={s.entryForm}>
        <div className={s.entryRow}>
          <input
            ref={amountRef}
            className={s.input}
            style={{ fontSize: '16px', flex: '0 0 110px' }}
            placeholder="valor"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={e => { setErr(''); setAmount(e.target.value.replace(/[^0-9,.]/g, '')) }}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), descRef.current?.focus())}
            onFocus={onFocus}
          />
          <input
            ref={descRef}
            className={s.input}
            style={{ fontSize: '16px' }}
            placeholder="descrição"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            onKeyDown={e => {
              if (!debtOpen) {
                if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); addTx(-1) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); addTx(1) }
              } else if (e.key === 'Enter') {
                e.preventDefault(); addTx(0)
              }
            }}
            onFocus={onFocus}
          />
        </div>

        {debtOpen && (
          <div className={s.entryRow}>
            <input
              className={s.input} style={{ fontSize: '16px' }}
              placeholder="devedor (opcional)" value={debtor}
              onChange={e => setDebtor(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTx(0)}
              onFocus={onFocus}
            />
            <input
              className={s.input} style={{ fontSize: '16px', flex: '0 0 130px' }}
              type="date" value={due}
              onChange={e => setDue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTx(0)}
              onFocus={onFocus}
            />
          </div>
        )}

        <div className={s.entryBtns}>
          <button className={`${s.btn} ${s.green}`}  onPointerDown={() => addTx(1)}>+ entrada</button>
          <button className={`${s.btn} ${s.danger}`} onPointerDown={() => addTx(-1)}>− saída</button>
          <button
            className={`${s.btn} ${s.debtBtn}${debtOpen ? ' ' + s.debtBtnActive : ''}`}
            onPointerDown={() => debtOpen ? addTx(0) : setDebtOpen(true)}
          >{debtOpen ? '○ ok' : '○ dívida'}</button>
        </div>
        {err && <p className={s.err}>{err}</p>}
      </div>

      <div className={s.txList}>
        {loading ? <div className={s.txLoading}>·</div> : (
          txs.length === 0
            ? <div className={s.empty}>sem lançamentos</div>
            : <>
                {visibleNormal.map(t => <TxRow key={t.id} t={t} onToggle={toggleDebt} onDel={delTx} />)}
                {extra > 0 && (
                  <button className={s.expandBtn} onClick={() => setExpanded(x => !x)}>
                    {expanded ? '▲' : `▼ ${extra} mais`}
                  </button>
                )}
                {debtTxs.length > 0 && <>
                  {normalTxs.length > 0 && <div className={s.divider}>a receber</div>}
                  {pendingDebts.map(t => <TxRow key={t.id} t={t} onToggle={toggleDebt} onDel={delTx} />)}
                  {settledDebts.length > 0 && <>
                    <div className={s.divider}>recebidas</div>
                    {settledDebts.map(t => <TxRow key={t.id} t={t} onToggle={toggleDebt} onDel={delTx} />)}
                  </>}
                </>}
              </>
        )}
      </div>

      <div className={s.boxFooter}>
        <button className={`${s.btn} ${s.danger} ${s.small}`}
          onPointerDown={e => { e.stopPropagation(); onDelete(box) }}>
          apagar caixa
        </button>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard({ user }) {
  const [boxes, setBoxes]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [newBoxName, setNewBoxName] = useState('')
  const [modalOpen, setModalOpen]   = useState(false)
  const [modalErr, setModalErr]     = useState('')
  const [focusedIdx, setFocusedIdx] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const cardRefs  = useRef([])
  const searchRef = useRef(null)
  const uid      = user.id
  const username = user.user_metadata?.username || user.email?.split('@')[0] || '—'

  useEffect(() => {
    supabase.from('boxes').select('id,name,created_at').eq('user_id', uid).order('created_at')
      .then(({ data }) => { setBoxes(data ?? []); setLoading(false) })
  }, [uid])

  const filtered = search
    ? boxes.filter(b => b.name.toLowerCase().includes(search.toLowerCase()))
    : boxes

  const navigate = useCallback((dir) => {
    setFocusedIdx(i => {
      const next = Math.max(0, Math.min(i + dir, filtered.length - 1))
      cardRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return next
    })
  }, [filtered.length])

  useEffect(() => {
    const handle = e => {
      const inInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
      if (e.key === 'Escape') {
        if (modalOpen) { setModalOpen(false); return }
        if (confirmDelete) { setConfirmDelete(null); return }
        searchRef.current?.blur(); return
      }
      if (e.key === '/' && !inInput) { e.preventDefault(); searchRef.current?.focus(); return }
      if (modalOpen || confirmDelete || inInput) return
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); navigate(1) }
      if (e.key === 'ArrowUp'   || e.key === 'k') { e.preventDefault(); navigate(-1) }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [modalOpen, confirmDelete, navigate])

  const createBox = useCallback(async () => {
    setModalErr('')
    const name = newBoxName.trim()
    if (!name) { setModalErr('nome obrigatório'); return }
    if (boxes.find(b => b.name.toLowerCase() === name.toLowerCase())) { setModalErr('já existe'); return }
    const { data, error } = await supabase.from('boxes')
      .insert({ name, user_id: uid }).select('id,name,created_at').single()
    if (error) { setModalErr(error.message); return }
    setBoxes(prev => [...prev, data])
    setModalOpen(false); setNewBoxName('')
  }, [newBoxName, boxes, uid])

  const deleteBox = useCallback(async (box) => {
    setBoxes(prev => prev.filter(b => b.id !== box.id))
    setConfirmDelete(null)
    await supabase.from('boxes').delete().eq('id', box.id)
  }, [])

  if (loading) return <div className={s.page}><div className={s.dot}>·</div></div>

  return (
    <div className={s.page}>
      <div className={s.wrap}>
        <div className={s.header}>
          <span className={s.logo}>encaixe</span>
          <input
            ref={searchRef}
            className={`${s.input} ${s.searchInput}`}
            style={{ fontSize: '16px' }}
            placeholder="buscar"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && searchRef.current?.blur()}
          />
          <div className={s.headerRight}>
            <button className={`${s.btn} ${s.small} ${s.addBoxBtn}`}
              onClick={() => { setModalOpen(true); setNewBoxName(''); setModalErr('') }}>
              + caixa
            </button>
            <button className={s.logoutBtn} onClick={() => supabase.auth.signOut()}>
              {username} ×
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className={s.empty} style={{ paddingTop: 64 }}>
            {boxes.length === 0 ? 'crie uma caixa para começar' : 'nada encontrado'}
          </div>
        ) : (
          <div className={s.boxList}>
            {filtered.map((box, i) => (
              <BoxCard
                key={box.id} box={box} uid={uid}
                focused={focusedIdx === i} onFocus={() => setFocusedIdx(i)}
                onDelete={b => setConfirmDelete(b)}
                cardRef={el => { cardRefs.current[i] = el }}
              />
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className={s.modalBg} onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className={s.modal}>
            <h3 className={s.modalTitle}>nova caixa</h3>
            <input
              className={s.input} style={{ fontSize: '16px' }}
              placeholder="nome" maxLength={24}
              value={newBoxName} onChange={e => setNewBoxName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createBox(); if (e.key === 'Escape') setModalOpen(false) }}
              autoFocus
            />
            {modalErr && <p className={s.err}>{modalErr}</p>}
            <div className={s.modalBtns}>
              <button className={s.btn} onClick={() => setModalOpen(false)}>cancelar</button>
              <button className={`${s.btn} ${s.primary}`} onClick={createBox}>criar</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className={s.modalBg} onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className={s.modal}>
            <h3 className={s.modalTitle}>apagar caixa</h3>
            <p className={s.modalSub}>
              apagar <span style={{ color: 'var(--yellow2)' }}>{confirmDelete.name}</span> e todos os dados?
            </p>
            <div className={s.modalBtns}>
              <button className={s.btn} onClick={() => setConfirmDelete(null)}>cancelar</button>
              <button className={`${s.btn} ${s.danger}`} onClick={() => deleteBox(confirmDelete)}>apagar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
