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

const parseAmount = str => parseFloat(str.replace(',', '.'))

// ── Debt item ────────────────────────────────────────────────────────────────
const DebtItem = memo(({ d, onSettle, onDel }) => (
  <div className={`${s.debtItem}${d.settled ? ' ' + s.debtSettled : ''}`}>
    <button
      className={`${s.checkbox}${d.settled ? ' ' + s.checked : ''}`}
      onClick={() => onSettle(d)}
      aria-label={d.settled ? 'reabrir' : 'quitar'}
    >
      {d.settled ? '✓' : ''}
    </button>
    <div className={s.txLeft}>
      <span className={s.txDesc}>{d.description || '—'}</span>
      <span className={s.txMeta}>
        {d.debtor ? `de ${d.debtor} · ` : ''}{timeAgo(d.created_at)}
        {d.due_date ? ` · vence ${new Date(d.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : ''}
      </span>
    </div>
    <span className={`${s.txAmt} ${d.settled ? s.inColor : s.debtColor}`}>
      {fmt(d.amount)}
    </span>
    <button className={s.delBtn} onClick={() => onDel(d.id)}>×</button>
  </div>
))

// ── Tx item ──────────────────────────────────────────────────────────────────
const TxItem = memo(({ t, onDel }) => (
  <div className={`${s.txItem} ${t.amount > 0 ? s.txIn : s.txOut}`}>
    <div className={s.txLeft}>
      <span className={s.txDesc}>{t.description || '—'}</span>
      <span className={s.txMeta}>{timeAgo(t.created_at)}</span>
    </div>
    <span className={`${s.txAmt} ${t.amount > 0 ? s.inColor : s.outColor}`}>
      {t.amount > 0 ? '+' : '−'}{fmt(t.amount)}
    </span>
    <button className={s.delBtn} onClick={() => onDel(t.id)}>×</button>
  </div>
))

// ── Amount input (no zoom on iOS, comma support) ─────────────────────────────
function AmountInput({ value, onChange, onEnter, inputRef, onFocus }) {
  return (
    <input
      ref={inputRef}
      className={s.input}
      style={{
        flex: '0 0 110px',
        fontSize: '16px', // prevents iOS zoom
        MozAppearance: 'textfield',
        WebkitAppearance: 'none',
        appearance: 'textfield',
      }}
      placeholder="valor"
      type="text"
      inputMode="decimal"
      value={value}
      onChange={e => {
        const v = e.target.value.replace(/[^0-9,.]/, '')
        onChange(v)
      }}
      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), onEnter())}
      onFocus={onFocus}
    />
  )
}

// ── Box card ─────────────────────────────────────────────────────────────────
function BoxCard({ box, uid, onDelete, focused, onFocus, cardRef }) {
  const [txs, setTxs]           = useState([])
  const [debts, setDebts]        = useState([])
  const [txLoading, setTxLoading] = useState(true)
  const [expanded, setExpanded]  = useState(false)
  const [tab, setTab]            = useState('tx') // 'tx' | 'debt'

  // tx form
  const [amount, setAmount] = useState('')
  const [desc, setDesc]     = useState('')
  const [entryErr, setEntryErr] = useState('')
  const amountRef = useRef(null)
  const descRef   = useRef(null)

  // debt form
  const [dAmount, setDAmount]   = useState('')
  const [dDesc, setDDesc]       = useState('')
  const [dDebtor, setDDebtor]   = useState('')
  const [dDue, setDDue]         = useState('')
  const [debtErr, setDebtErr]   = useState('')
  const dAmountRef = useRef(null)

  const loadTxs = useCallback(async () => {
    setTxLoading(true)
    const [{ data: txData }, { data: debtData }] = await Promise.all([
      supabase.from('transactions')
        .select('id,amount,description,created_at')
        .eq('box_id', box.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('debts')
        .select('*')
        .eq('box_id', box.id).order('created_at', { ascending: false }),
    ])
    if (txData)   setTxs(txData)
    if (debtData) setDebts(debtData)
    setTxLoading(false)
  }, [box.id])

  useEffect(() => { loadTxs() }, [loadTxs])

  useEffect(() => {
    if (focused) {
      if (tab === 'tx') amountRef.current?.focus()
      else dAmountRef.current?.focus()
    }
  }, [focused, tab])

  const addTx = useCallback(async (sign) => {
    setEntryErr('')
    const v = parseAmount(amount)
    if (!amount || isNaN(v) || v <= 0) { setEntryErr('valor inválido'); return }
    const { error } = await supabase.from('transactions').insert({
      box_id: box.id, user_id: uid, amount: sign * v,
      description: desc.trim() || null,
    })
    if (!error) { setAmount(''); setDesc(''); loadTxs(); amountRef.current?.focus() }
  }, [amount, desc, box.id, uid, loadTxs])

  const delTx = useCallback(async (id) => {
    await supabase.from('transactions').delete().eq('id', id).eq('user_id', uid)
    setTxs(prev => prev.filter(t => t.id !== id))
  }, [uid])

  const addDebt = useCallback(async () => {
    setDebtErr('')
    const v = parseAmount(dAmount)
    if (!dAmount || isNaN(v) || v <= 0) { setDebtErr('valor inválido'); return }
    const { error } = await supabase.from('debts').insert({
      box_id: box.id, user_id: uid,
      amount: v,
      description: dDesc.trim() || null,
      debtor: dDebtor.trim() || null,
      due_date: dDue || null,
      settled: false,
    })
    if (!error) { setDAmount(''); setDDesc(''); setDDebtor(''); setDDue(''); loadTxs(); dAmountRef.current?.focus() }
    else setDebtErr(error.message)
  }, [dAmount, dDesc, dDebtor, dDue, box.id, uid, loadTxs])

  const settleDebt = useCallback(async (d) => {
    const nowSettled = !d.settled
    await supabase.from('debts').update({ settled: nowSettled, settled_at: nowSettled ? new Date().toISOString() : null }).eq('id', d.id)
    if (nowSettled) {
      // book as income transaction
      await supabase.from('transactions').insert({
        box_id: box.id, user_id: uid,
        amount: d.amount,
        description: `dívida quitada${d.description ? ': ' + d.description : ''}${d.debtor ? ' (' + d.debtor + ')' : ''}`,
      })
    }
    loadTxs()
  }, [box.id, uid, loadTxs])

  const delDebt = useCallback(async (id) => {
    await supabase.from('debts').delete().eq('id', id)
    setDebts(prev => prev.filter(d => d.id !== id))
  }, [])

  const income  = txs.reduce((a, t) => t.amount > 0 ? a + t.amount : a, 0)
  const expense = txs.reduce((a, t) => t.amount < 0 ? a + t.amount : a, 0)
  const pendingDebt = debts.filter(d => !d.settled).reduce((a, d) => a + d.amount, 0)
  const bal = income + expense

  const visible = expanded ? txs : txs.slice(0, 3)
  const extra   = txs.length - 3

  const pendingDebts  = debts.filter(d => !d.settled)
  const settledDebts  = debts.filter(d => d.settled)
  const overdueDebts  = pendingDebts.filter(d => d.due_date && new Date(d.due_date) < new Date())

  return (
    <div
      ref={cardRef}
      className={`${s.boxCard}${focused ? ' ' + s.focused : ''}`}
      onClick={onFocus}
    >
      {/* balance */}
      <div className={s.balCard}>
        <div>
          <div className={s.balLabel}>{box.name.toUpperCase()}</div>
          <div className={`${s.balAmount} ${bal > 0 ? s.pos : bal < 0 ? s.neg : s.zero}`}>
            {bal < 0 ? '−' : ''}{fmt(bal)}
          </div>
        </div>
        <div className={s.balStats}>
          <div>+ <span className={s.inColor}>{fmt(income)}</span></div>
          <div>− <span className={s.outColor}>{fmt(Math.abs(expense))}</span></div>
          {pendingDebt > 0 && (
            <div className={s.debtBadge}>↻ <span className={s.debtColor}>{fmt(pendingDebt)}</span></div>
          )}
        </div>
      </div>

      {/* tabs */}
      <div className={s.tabs}>
        <button className={`${s.tab}${tab === 'tx' ? ' ' + s.tabActive : ''}`} onClick={() => setTab('tx')}>
          lançamentos
        </button>
        <button className={`${s.tab}${tab === 'debt' ? ' ' + s.tabActive : ''}`} onClick={() => setTab('debt')}>
          dívidas {pendingDebts.length > 0 && <span className={`${s.badge}${overdueDebts.length > 0 ? ' ' + s.badgeRed : ''}`}>{pendingDebts.length}</span>}
        </button>
      </div>

      {/* lançamentos form */}
      {tab === 'tx' && (
        <>
          <div className={s.entryForm}>
            <div className={s.entryRow}>
              <AmountInput
                inputRef={amountRef}
                value={amount}
                onChange={setAmount}
                onEnter={() => descRef.current?.focus()}
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
                  if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); addTx(-1) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); addTx(1) }
                }}
                onFocus={onFocus}
              />
            </div>
            <div className={s.entryBtns}>
              <button className={`${s.btn} ${s.green}`} onClick={() => addTx(1)}>+ entrada</button>
              <button className={`${s.btn} ${s.danger}`} onClick={() => addTx(-1)}>− saída</button>
            </div>
            {entryErr && <p className={s.err}>{entryErr}</p>}
          </div>

          <div className={s.txList}>
            {txLoading
              ? <div className={s.txLoading}>·</div>
              : txs.length === 0
                ? <div className={s.empty}>sem lançamentos</div>
                : visible.map(t => <TxItem key={t.id} t={t} onDel={delTx} />)
            }
            {extra > 0 && (
              <button className={s.expandBtn} onClick={() => setExpanded(x => !x)}>
                {expanded ? '▲' : `▼ ${extra} mais`}
              </button>
            )}
          </div>
        </>
      )}

      {/* dívidas form */}
      {tab === 'debt' && (
        <>
          <div className={s.entryForm}>
            <div className={s.entryRow}>
              <AmountInput
                inputRef={dAmountRef}
                value={dAmount}
                onChange={setDAmount}
                onEnter={() => document.getElementById(`dd-${box.id}`)?.focus()}
                onFocus={onFocus}
              />
              <input
                id={`dd-${box.id}`}
                className={s.input}
                style={{ fontSize: '16px' }}
                placeholder="descrição"
                value={dDesc}
                onChange={e => setDDesc(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && document.getElementById(`dbt-${box.id}`)?.focus()}
                onFocus={onFocus}
              />
            </div>
            <div className={s.entryRow}>
              <input
                id={`dbt-${box.id}`}
                className={s.input}
                style={{ fontSize: '16px' }}
                placeholder="devedor (opcional)"
                value={dDebtor}
                onChange={e => setDDebtor(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && document.getElementById(`due-${box.id}`)?.focus()}
                onFocus={onFocus}
              />
              <input
                id={`due-${box.id}`}
                className={s.input}
                style={{ fontSize: '16px', flex: '0 0 130px' }}
                type="date"
                title="vencimento"
                value={dDue}
                onChange={e => setDDue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addDebt()}
                onFocus={onFocus}
              />
            </div>
            <button className={`${s.btn} ${s.primary} ${s.full}`} onClick={addDebt}>+ registrar dívida</button>
            {debtErr && <p className={s.err}>{debtErr}</p>}
          </div>

          <div className={s.txList}>
            {txLoading
              ? <div className={s.txLoading}>·</div>
              : debts.length === 0
                ? <div className={s.empty}>sem dívidas</div>
                : <>
                    {pendingDebts.map(d => <DebtItem key={d.id} d={d} onSettle={settleDebt} onDel={delDebt} />)}
                    {settledDebts.length > 0 && pendingDebts.length > 0 && <div className={s.divider}>quitadas</div>}
                    {settledDebts.map(d => <DebtItem key={d.id} d={d} onSettle={settleDebt} onDel={delDebt} />)}
                  </>
            }
          </div>
        </>
      )}

      <div className={s.boxFooter}>
        <button
          className={`${s.btn} ${s.danger} ${s.small}`}
          onClick={e => { e.stopPropagation(); onDelete(box) }}
        >apagar caixa</button>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard({ user }) {
  const [boxes, setBoxes]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [modal, setModal]       = useState(null)
  const [newBoxName, setNewBoxName] = useState('')
  const [modalErr, setModalErr] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(0)
  const [pendingDelete, setPendingDelete] = useState(null)
  const cardRefs  = useRef([])
  const searchRef = useRef(null)
  const uid = user.id
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
    const { data, error } = await supabase.from('boxes').insert({ name, user_id: uid }).select().single()
    if (error) { setModalErr(error.message); return }
    setBoxes(prev => [...prev, data])
    setModal(null); setNewBoxName('')
  }, [newBoxName, boxes, uid])

  const deleteBox = useCallback(async (box) => {
    await Promise.all([
      supabase.from('transactions').delete().eq('box_id', box.id),
      supabase.from('debts').delete().eq('box_id', box.id),
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
            <button
              className={`${s.btn} ${s.small} ${s.addBoxBtn}`}
              onClick={() => { setModal('newbox'); setNewBoxName(''); setModalErr('') }}
            >+ caixa</button>
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
                key={box.id}
                box={box}
                uid={uid}
                focused={focusedIdx === i}
                onFocus={() => setFocusedIdx(i)}
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
              className={s.input}
              style={{ fontSize: '16px' }}
              placeholder="nome"
              maxLength={24}
              value={newBoxName}
              onChange={e => setNewBoxName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createBox(); if (e.key === 'Escape') setModal(null) }}
              autoFocus
            />
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
              apagar <span style={{ color: 'var(--yellow2)' }}>{pendingDelete.name}</span> e todas as transações e dívidas?
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
