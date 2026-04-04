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

// ── Transaction item ──────────────────────────────────────────────────────────
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

// ── Debt item ─────────────────────────────────────────────────────────────────
const DebtItem = memo(({ d, onSettle, onDel }) => {
  const overdue = !d.settled && d.due_date && new Date(d.due_date) < new Date()
  return (
    <div className={`${s.debtItem}${d.settled ? ' ' + s.debtSettled : ''}${overdue ? ' ' + s.debtOverdue : ''}`}>
      <button
        className={`${s.checkbox}${d.settled ? ' ' + s.checked : ''}`}
        onClick={() => onSettle(d)}
        title={d.settled ? 'desquitar' : 'quitar'}
      >
        {d.settled ? '✓' : ''}
      </button>
      <div className={s.txLeft}>
        <span className={s.txDesc}>{d.description || '—'}</span>
        <span className={s.txMeta}>
          {d.debtor ? `${d.debtor} · ` : ''}
          {timeAgo(d.created_at)}
          {d.due_date ? ` · vence ${new Date(d.due_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : ''}
        </span>
      </div>
      <span className={`${s.txAmt} ${d.settled ? s.inColor : overdue ? s.outColor : s.debtColor}`}>
        {fmt(d.amount)}
      </span>
      <button className={s.delBtn} onClick={() => onDel(d.id)}>×</button>
    </div>
  )
})

// ── Normal box (transactions only) ───────────────────────────────────────────
function NormalCard({ box, uid, onDelete, focused, onFocus, cardRef }) {
  const [txs, setTxs]         = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [amount, setAmount]   = useState('')
  const [desc, setDesc]       = useState('')
  const [err, setErr]         = useState('')
  const amountRef = useRef(null)
  const descRef   = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('transactions').select('id,amount,description,created_at')
      .eq('box_id', box.id).order('created_at', { ascending: false }).limit(100)
    if (data) setTxs(data)
    setLoading(false)
  }, [box.id])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (focused) amountRef.current?.focus() }, [focused])

  const addTx = useCallback(async (sign) => {
    setErr('')
    const v = parseAmt(amount)
    if (!amount || isNaN(v) || v <= 0) { setErr('valor inválido'); return }
    const { error } = await supabase.from('transactions').insert({
      box_id: box.id, user_id: uid, amount: sign * v,
      description: desc.trim() || null,
    })
    if (!error) { setAmount(''); setDesc(''); load(); amountRef.current?.focus() }
  }, [amount, desc, box.id, uid, load])

  const delTx = useCallback(async (id) => {
    await supabase.from('transactions').delete().eq('id', id).eq('user_id', uid)
    setTxs(prev => prev.filter(t => t.id !== id))
  }, [uid])

  const income  = txs.reduce((a, t) => t.amount > 0 ? a + t.amount : a, 0)
  const expense = txs.reduce((a, t) => t.amount < 0 ? a + t.amount : a, 0)
  const bal     = income + expense
  const visible = expanded ? txs : txs.slice(0, 3)
  const extra   = txs.length - 3

  return (
    <div ref={cardRef} className={`${s.boxCard}${focused ? ' ' + s.focused : ''}`} onClick={onFocus}>
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
        </div>
      </div>

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
        {err && <p className={s.err}>{err}</p>}
      </div>

      <div className={s.txList}>
        {loading
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

      <div className={s.boxFooter}>
        <button className={`${s.btn} ${s.danger} ${s.small}`}
          onClick={e => { e.stopPropagation(); onDelete(box) }}>apagar caixa</button>
      </div>
    </div>
  )
}

// ── Debt box ──────────────────────────────────────────────────────────────────
function DebtCard({ box, uid, onDelete, focused, onFocus, cardRef }) {
  const [debts, setDebts]     = useState([])
  const [loading, setLoading] = useState(true)
  const [dAmount, setDAmount] = useState('')
  const [dDesc, setDDesc]     = useState('')
  const [dDebtor, setDDebtor] = useState('')
  const [dDue, setDDue]       = useState('')
  const [err, setErr]         = useState('')
  const amountRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('debts').select('*')
      .eq('box_id', box.id).order('settled').order('created_at', { ascending: false })
    if (data) setDebts(data)
    setLoading(false)
  }, [box.id])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (focused) amountRef.current?.focus() }, [focused])

  const addDebt = useCallback(async () => {
    setErr('')
    const v = parseAmt(dAmount)
    if (!dAmount || isNaN(v) || v <= 0) { setErr('valor inválido'); return }
    const { error } = await supabase.from('debts').insert({
      box_id: box.id, user_id: uid,
      amount: v,
      description: dDesc.trim() || null,
      debtor: dDebtor.trim() || null,
      due_date: dDue || null,
      settled: false,
      settled_tx_id: null,
    })
    if (!error) { setDAmount(''); setDDesc(''); setDDebtor(''); setDDue(''); load(); amountRef.current?.focus() }
    else setErr(error.message)
  }, [dAmount, dDesc, dDebtor, dDue, box.id, uid, load])

  const settleDebt = useCallback(async (d) => {
    if (!d.settled) {
      // quitar: create tx, save its id in debt
      const { data: tx } = await supabase.from('transactions').insert({
        box_id: box.id, user_id: uid, amount: d.amount,
        description: `quitado${d.description ? ': ' + d.description : ''}${d.debtor ? ' (' + d.debtor + ')' : ''}`,
      }).select('id').single()
      if (tx) {
        await supabase.from('debts').update({ settled: true, settled_at: new Date().toISOString(), settled_tx_id: tx.id }).eq('id', d.id)
      }
    } else {
      // desquitar: delete the linked tx, clear debt
      if (d.settled_tx_id) {
        await supabase.from('transactions').delete().eq('id', d.settled_tx_id)
      }
      await supabase.from('debts').update({ settled: false, settled_at: null, settled_tx_id: null }).eq('id', d.id)
    }
    load()
  }, [box.id, uid, load])

  const delDebt = useCallback(async (d) => {
    // if settled, also delete the linked tx
    if (d.settled && d.settled_tx_id) {
      await supabase.from('transactions').delete().eq('id', d.settled_tx_id)
    }
    await supabase.from('debts').delete().eq('id', d.id)
    setDebts(prev => prev.filter(x => x.id !== d.id))
  }, [])

  const pending  = debts.filter(d => !d.settled)
  const settled  = debts.filter(d => d.settled)
  const overdue  = pending.filter(d => d.due_date && new Date(d.due_date) < new Date())
  const totalPending  = pending.reduce((a, d) => a + d.amount, 0)
  const totalSettled  = settled.reduce((a, d) => a + d.amount, 0)

  return (
    <div ref={cardRef} className={`${s.boxCard} ${s.debtBox}${focused ? ' ' + s.focused : ''}`} onClick={onFocus}>
      <div className={s.balCard}>
        <div>
          <div className={s.balLabel}>{box.name.toUpperCase()} <span className={s.typeTag}>dívidas</span></div>
          <div className={`${s.balAmount} ${totalPending > 0 ? s.debtColor : s.zero}`}>
            {fmt(totalPending)}
          </div>
          <div className={s.balSub}>a receber</div>
        </div>
        <div className={s.balStats}>
          {overdue.length > 0 && <div className={s.overdueTag}>{overdue.length} vencida{overdue.length > 1 ? 's' : ''}</div>}
          <div>recebido <span className={s.inColor}>{fmt(totalSettled)}</span></div>
          <div>{pending.length} pendente{pending.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <div className={s.entryForm}>
        <div className={s.entryRow}>
          <AmountInput
            inputRef={amountRef} value={dAmount} onChange={setDAmount}
            onEnter={() => document.getElementById(`dd-${box.id}`)?.focus()}
            onFocus={onFocus} style={{ flex: '0 0 110px' }}
          />
          <input id={`dd-${box.id}`} className={s.input} style={{ fontSize: '16px' }}
            placeholder="descrição" value={dDesc} onChange={e => setDDesc(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && document.getElementById(`dbt-${box.id}`)?.focus()}
            onFocus={onFocus} />
        </div>
        <div className={s.entryRow}>
          <input id={`dbt-${box.id}`} className={s.input} style={{ fontSize: '16px' }}
            placeholder="devedor" value={dDebtor} onChange={e => setDDebtor(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && document.getElementById(`due-${box.id}`)?.focus()}
            onFocus={onFocus} />
          <input id={`due-${box.id}`} className={s.input}
            style={{ fontSize: '16px', flex: '0 0 130px' }}
            type="date" title="vencimento" value={dDue}
            onChange={e => setDDue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addDebt()}
            onFocus={onFocus} />
        </div>
        <button className={`${s.btn} ${s.primary} ${s.full}`} onClick={addDebt}>+ registrar dívida</button>
        {err && <p className={s.err}>{err}</p>}
      </div>

      <div className={s.txList}>
        {loading
          ? <div className={s.txLoading}>·</div>
          : debts.length === 0
            ? <div className={s.empty}>sem dívidas</div>
            : <>
                {pending.map(d => <DebtItem key={d.id} d={d} onSettle={settleDebt} onDel={delDebt} />)}
                {settled.length > 0 && (
                  <>
                    {pending.length > 0 && <div className={s.divider}>quitadas</div>}
                    {settled.map(d => <DebtItem key={d.id} d={d} onSettle={settleDebt} onDel={delDebt} />)}
                  </>
                )}
              </>
        }
      </div>

      <div className={s.boxFooter}>
        <button className={`${s.btn} ${s.danger} ${s.small}`}
          onClick={e => { e.stopPropagation(); onDelete(box) }}>apagar caixa</button>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard({ user }) {
  const [boxes, setBoxes]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [modal, setModal]           = useState(null) // null | 'newbox' | 'delbox'
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
    // for debt boxes, also delete the linked transactions
    if (box.type === 'debt') {
      const { data: settledDebts } = await supabase.from('debts')
        .select('settled_tx_id').eq('box_id', box.id).eq('settled', true).not('settled_tx_id', 'is', null)
      if (settledDebts?.length) {
        const ids = settledDebts.map(d => d.settled_tx_id)
        await supabase.from('transactions').delete().in('id', ids)
      }
    }
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
            {filtered.map((box, i) =>
              box.type === 'debt'
                ? <DebtCard key={box.id} box={box} uid={uid}
                    focused={focusedIdx === i} onFocus={() => setFocusedIdx(i)}
                    onDelete={b => setPendingDelete(b)}
                    cardRef={el => { cardRefs.current[i] = el }} />
                : <NormalCard key={box.id} box={box} uid={uid}
                    focused={focusedIdx === i} onFocus={() => setFocusedIdx(i)}
                    onDelete={b => setPendingDelete(b)}
                    cardRef={el => { cardRefs.current[i] = el }} />
            )}
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
              <button
                className={`${s.typeBtn}${newBoxType === 'normal' ? ' ' + s.typeBtnActive : ''}`}
                onClick={() => setNewBoxType('normal')}>
                normal
              </button>
              <button
                className={`${s.typeBtn}${newBoxType === 'debt' ? ' ' + s.typeBtnActiveDebt : ''}`}
                onClick={() => setNewBoxType('debt')}>
                dívidas
              </button>
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
