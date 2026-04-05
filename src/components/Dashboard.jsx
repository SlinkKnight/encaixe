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

const parseAmt = s => parseFloat(String(s).replace(',', '.'))

// Unified transaction row — handles both normal and pending (debt) entries
const TxRow = memo(({ t, onToggle, onDel }) => {
  const isPending = t.pending
  const overdue   = isPending && t.due_date && new Date(t.due_date + 'T12:00') < new Date()
  const cls = isPending
    ? `${s.txItem} ${s.txPending}${overdue ? ' ' + s.txOverdue : ''}`
    : `${s.txItem} ${t.amount > 0 ? s.txIn : s.txOut}`

  return (
    <div className={cls}>
      {isPending && (
        <button
          className={`${s.checkbox}${t.settled ? ' ' + s.checked : ''}`}
          onPointerDown={e => { e.stopPropagation(); onToggle(t) }}
        >
          {t.settled ? '✓' : ''}
        </button>
      )}
      <div className={`${s.txLeft}${isPending && t.settled ? ' ' + s.strikethrough : ''}`}>
        <span className={s.txDesc}>{t.description || '—'}</span>
        <span className={s.txMeta}>
          {t.debtor ? `${t.debtor} · ` : ''}
          {timeAgo(t.created_at)}
          {t.due_date ? ` · ${new Date(t.due_date + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : ''}
        </span>
      </div>
      <span className={`${s.txAmt} ${isPending ? (t.settled ? s.inColor : overdue ? s.outColor : s.pendingColor) : t.amount > 0 ? s.inColor : s.outColor}`}>
        {!isPending && (t.amount > 0 ? '+' : '−')}{fmt(t.amount)}
      </span>
      <button
        className={s.delBtn}
        onPointerDown={e => { e.stopPropagation(); onDel(t) }}
      >×</button>
    </div>
  )
})

function AmountInput({ value, onChange, onEnter, inputRef, onFocus, style }) {
  return (
    <input
      ref={inputRef}
      className={s.input}
      style={{ fontSize: '16px', ...style }}
      placeholder="valor"
      type="text"
      inputMode="decimal"
      value={value}
      onChange={e => onChange(e.target.value.replace(/[^0-9,.]/g, ''))}
      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), onEnter?.())}
      onFocus={onFocus}
    />
  )
}

// ── Box card — unified, type drives form UI only ──────────────────────────────
function BoxCard({ box, uid, onDelete, focused, onFocus, cardRef }) {
  const [txs, setTxs]           = useState([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(false)
  // form
  const [amount, setAmount] = useState('')
  const [desc,   setDesc]   = useState('')
  const [debtor, setDebtor] = useState('')
  const [due,    setDue]    = useState('')
  const [err,    setErr]    = useState('')
  const amountRef = useRef(null)
  const descRef   = useRef(null)

  const isDebt = box.type === 'debt'

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select('id,amount,description,pending,settled,debtor,due_date,created_at')
      .eq('box_id', box.id)
      .order('pending')                          // pending last
      .order('created_at', { ascending: false })
      .limit(150)
    if (data) setTxs(data)
    setLoading(false)
  }, [box.id])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (focused) amountRef.current?.focus() }, [focused])

  const addTx = useCallback(async (sign) => {
    setErr('')
    const v = parseAmt(amount)
    if (!amount || isNaN(v) || v <= 0) { setErr('valor inválido'); return }
    const row = isDebt
      ? { box_id: box.id, user_id: uid, amount: v, description: desc.trim() || null,
          debtor: debtor.trim() || null, due_date: due || null, pending: true, settled: false }
      : { box_id: box.id, user_id: uid, amount: sign * v, description: desc.trim() || null,
          pending: false, settled: false }
    const { error } = await supabase.from('transactions').insert(row)
    if (!error) {
      setAmount(''); setDesc(''); setDebtor(''); setDue('')
      load(); amountRef.current?.focus()
    }
  }, [amount, desc, debtor, due, isDebt, box.id, uid, load])

  const togglePending = useCallback(async (t) => {
    await supabase.from('transactions')
      .update({ settled: !t.settled, pending: !t.settled ? false : true })
      .eq('id', t.id)
    // pending=false means it now counts in balance; pending=true means reverted
    load()
  }, [load])

  const delTx = useCallback(async (t) => {
    await supabase.from('transactions').delete().eq('id', t.id).eq('user_id', uid)
    setTxs(prev => prev.filter(x => x.id !== t.id))
  }, [uid])

  // compute balance: normal transactions + settled debts
  const normal  = txs.filter(t => !t.pending)
  const debts   = txs.filter(t => t.pending || t.settled)
  const income  = normal.reduce((a, t) => t.amount > 0 ? a + t.amount : a, 0)
  const expense = normal.reduce((a, t) => t.amount < 0 ? a + t.amount : a, 0)
  const settled = debts.filter(t => t.settled).reduce((a, t) => a + t.amount, 0)
  const pending = debts.filter(t => !t.settled).reduce((a, t) => a + t.amount, 0)
  const bal     = income + expense + settled

  const visibleTxs = isDebt ? txs : (expanded ? normal : normal.slice(0, 3))
  const extra       = normal.length - 3
  const overdueN    = debts.filter(t => !t.settled && t.due_date && new Date(t.due_date + 'T12:00') < new Date()).length

  return (
    <div ref={cardRef} className={`${s.boxCard}${isDebt ? ' ' + s.debtBox : ''}${focused ? ' ' + s.focused : ''}`} onClick={onFocus}>

      {/* balance header */}
      <div className={s.balCard}>
        <div>
          <div className={s.balLabel}>
            {box.name.toUpperCase()}
            {isDebt && <span className={s.typeTag}>dívidas</span>}
          </div>
          <div className={`${s.balAmount} ${isDebt ? (pending > 0 ? s.pendingColor : s.zero) : (bal > 0 ? s.pos : bal < 0 ? s.neg : s.zero)}`}>
            {isDebt ? fmt(pending) : (bal < 0 ? '−' : '') + fmt(bal)}
          </div>
          {isDebt && <div className={s.balSub}>a receber</div>}
        </div>
        <div className={s.balStats}>
          {isDebt ? <>
            {overdueN > 0 && <div className={s.overdueTag}>{overdueN} vencida{overdueN > 1 ? 's' : ''}</div>}
            <div>recebido <span className={s.inColor}>{fmt(settled)}</span></div>
            <div>{debts.filter(t => !t.settled).length} pendente{debts.filter(t => !t.settled).length !== 1 ? 's' : ''}</div>
          </> : <>
            <div>+ <span className={s.inColor}>{fmt(income)}</span></div>
            <div>− <span className={s.outColor}>{fmt(Math.abs(expense))}</span></div>
          </>}
        </div>
      </div>

      {/* form */}
      <div className={s.entryForm}>
        <div className={s.entryRow}>
          <AmountInput
            inputRef={amountRef} value={amount} onChange={setAmount}
            onEnter={() => descRef.current?.focus()} onFocus={onFocus}
            style={{ flex: '0 0 110px' }}
          />
          <input
            ref={descRef} className={s.input} style={{ fontSize: '16px' }}
            placeholder="descrição" value={desc}
            onChange={e => setDesc(e.target.value)}
            onKeyDown={e => {
              if (!isDebt) {
                if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); addTx(-1) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); addTx(1) }
              } else if (e.key === 'Enter') {
                e.preventDefault()
                document.getElementById(`dbt-${box.id}`)?.focus()
              }
            }}
            onFocus={onFocus}
          />
        </div>

        {isDebt && (
          <div className={s.entryRow}>
            <input
              id={`dbt-${box.id}`} className={s.input} style={{ fontSize: '16px' }}
              placeholder="devedor" value={debtor}
              onChange={e => setDebtor(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && document.getElementById(`due-${box.id}`)?.focus()}
              onFocus={onFocus}
            />
            <input
              id={`due-${box.id}`} className={s.input}
              style={{ fontSize: '16px', flex: '0 0 130px' }}
              type="date" value={due}
              onChange={e => setDue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTx(1)}
              onFocus={onFocus}
            />
          </div>
        )}

        {isDebt
          ? <button className={`${s.btn} ${s.primary} ${s.full}`} onClick={() => addTx(1)}>+ registrar dívida</button>
          : <div className={s.entryBtns}>
              <button className={`${s.btn} ${s.green}`} onClick={() => addTx(1)}>+ entrada</button>
              <button className={`${s.btn} ${s.danger}`} onClick={() => addTx(-1)}>− saída</button>
            </div>
        }
        {err && <p className={s.err}>{err}</p>}
      </div>

      {/* list */}
      <div className={s.txList}>
        {loading
          ? <div className={s.txLoading}>·</div>
          : visibleTxs.length === 0
            ? <div className={s.empty}>{isDebt ? 'sem dívidas' : 'sem lançamentos'}</div>
            : visibleTxs.map(t => (
                <TxRow key={t.id} t={t} onToggle={togglePending} onDel={delTx} />
              ))
        }
        {!isDebt && extra > 0 && (
          <button className={s.expandBtn} onClick={() => setExpanded(x => !x)}>
            {expanded ? '▲' : `▼ ${extra} mais`}
          </button>
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
  const [modal, setModal]           = useState(null)
  const [newBoxName, setNewBoxName] = useState('')
  const [newBoxType, setNewBoxType] = useState('normal')
  const [modalErr, setModalErr]     = useState('')
  const [focusedIdx, setFocusedIdx] = useState(0)
  const [pendingDelete, setPendingDelete] = useState(null)
  const cardRefs  = useRef([])
  const searchRef = useRef(null)
  const uid      = user.id
  const username = user.user_metadata?.username || user.email?.split('@')[0] || '—'

  useEffect(() => {
    supabase.from('boxes').select('*').eq('user_id', uid).order('created_at')
      .then(({ data }) => { if (data) setBoxes(data); setLoading(false) })
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
    const onKey = e => {
      const inInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
      if (e.key === 'Escape') {
        modal ? setModal(null) : pendingDelete ? setPendingDelete(null) : searchRef.current?.blur()
        return
      }
      if (e.key === '/' && !inInput) { e.preventDefault(); searchRef.current?.focus(); return }
      if (modal || pendingDelete || inInput) return
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); navigate(1) }
      if (e.key === 'ArrowUp'   || e.key === 'k') { e.preventDefault(); navigate(-1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal, pendingDelete, navigate])

  const createBox = useCallback(async () => {
    setModalErr('')
    const name = newBoxName.trim()
    if (!name) { setModalErr('nome obrigatório'); return }
    if (boxes.find(b => b.name.toLowerCase() === name.toLowerCase())) { setModalErr('já existe'); return }
    const { data, error } = await supabase.from('boxes')
      .insert({ name, user_id: uid, type: newBoxType }).select().single()
    if (error) { setModalErr(error.message); return }
    setBoxes(prev => [...prev, data])
    setModal(null); setNewBoxName(''); setNewBoxType('normal')
  }, [newBoxName, newBoxType, boxes, uid])

  const deleteBox = useCallback(async (box) => {
    await Promise.all([
      supabase.from('transactions').delete().eq('box_id', box.id),
      supabase.from('boxes').delete().eq('id', box.id),
    ])
    setBoxes(prev => prev.filter(b => b.id !== box.id))
    setPendingDelete(null)
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
              onClick={() => { setModal('newbox'); setNewBoxName(''); setNewBoxType('normal'); setModalErr('') }}>
              + caixa
            </button>
            <button className={s.logoutBtn} onClick={() => supabase.auth.signOut()}>
              {username} ×
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className={s.empty} style={{ paddingTop: 64 }}>
            {boxes.length === 0 ? 'crie uma caixa para começar' : 'nenhuma caixa encontrada'}
          </div>
        ) : (
          <div className={s.boxList}>
            {filtered.map((box, i) => (
              <BoxCard
                key={box.id} box={box} uid={uid}
                focused={focusedIdx === i} onFocus={() => setFocusedIdx(i)}
                onDelete={b => setPendingDelete(b)}
                cardRef={el => { cardRefs.current[i] = el }}
              />
            ))}
          </div>
        )}
      </div>

      {modal === 'newbox' && (
        <div className={s.modalBg} onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className={s.modal}>
            <h3 className={s.modalTitle}>nova caixa</h3>
            <input
              className={s.input} style={{ fontSize: '16px' }}
              placeholder="nome" maxLength={24}
              value={newBoxName} onChange={e => setNewBoxName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createBox(); if (e.key === 'Escape') setModal(null) }}
              autoFocus
            />
            <div className={s.typeToggle}>
              <button className={`${s.typeBtn}${newBoxType === 'normal' ? ' ' + s.typeBtnActive : ''}`}
                onClick={() => setNewBoxType('normal')}>normal</button>
              <button className={`${s.typeBtn}${newBoxType === 'debt' ? ' ' + s.typeBtnDebt : ''}`}
                onClick={() => setNewBoxType('debt')}>dívidas</button>
            </div>
            {modalErr && <p className={s.err}>{modalErr}</p>}
            <div className={s.modalBtns}>
              <button className={s.btn} onClick={() => setModal(null)}>cancelar</button>
              <button className={`${s.btn} ${s.primary}`} onClick={createBox}>criar</button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className={s.modalBg} onClick={e => e.target === e.currentTarget && setPendingDelete(null)}>
          <div className={s.modal}>
            <h3 className={s.modalTitle}>apagar caixa</h3>
            <p className={s.modalSub}>
              apagar <span style={{ color: 'var(--yellow2)' }}>{pendingDelete.name}</span> e todos os dados?
            </p>
            <div className={s.modalBtns}>
              <button className={s.btn} onClick={() => setPendingDelete(null)}>cancelar</button>
              <button className={`${s.btn} ${s.danger}`} onClick={() => deleteBox(pendingDelete)}>apagar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
