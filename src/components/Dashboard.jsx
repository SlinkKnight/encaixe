import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { supabase } from '../lib/supabase'
import s from './Dashboard.module.css'

// ── utils ────────────────────────────────────────────────────────────────────
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

// ── TxRow ────────────────────────────────────────────────────────────────────
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

// ── AmountInput ───────────────────────────────────────────────────────────────
const AmountInput = ({ value, onChange, onEnter, inputRef, onFocus, style }) => (
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

// ── BoxCard ───────────────────────────────────────────────────────────────────
function BoxCard({ box, uid, onDelete, focused, onFocus, cardRef }) {
  const isDebt = box.type === 'debt'

  const [txs, setTxs]           = useState([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [amount, setAmount]     = useState('')
  const [desc,   setDesc]       = useState('')
  const [debtor, setDebtor]     = useState('')
  const [due,    setDue]        = useState('')
  const [err,    setErr]        = useState('')
  const amountRef = useRef(null)
  const descRef   = useRef(null)

  // load — stable ref avoids stale closure loops
  const boxId = box.id
  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select('id,amount,description,pending,settled,debtor,due_date,created_at')
      .eq('box_id', boxId)
      .order('settled', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(150)
    setTxs(data ?? [])
    setLoading(false)
  }, [boxId])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (focused) amountRef.current?.focus() }, [focused])

  const addTx = useCallback(async (sign) => {
    setErr('')
    const v = parseAmt(amount)
    if (!amount || isNaN(v) || v <= 0) { setErr('valor inválido'); return }
    const row = isDebt
      ? { box_id: boxId, user_id: uid, amount: v, description: desc.trim() || null,
          debtor: debtor.trim() || null, due_date: due || null, pending: true, settled: false }
      : { box_id: boxId, user_id: uid, amount: sign * v, description: desc.trim() || null,
          pending: false, settled: false }
    const { error } = await supabase.from('transactions').insert(row)
    if (!error) { setAmount(''); setDesc(''); setDebtor(''); setDue(''); load() }
    amountRef.current?.focus()
  }, [amount, desc, debtor, due, isDebt, boxId, uid, load])

  const toggleDebt = useCallback(async (t) => {
    const nowSettled = !t.settled
    // settled=true → counts in balance (pending stays true to mark it as a debt row)
    await supabase.from('transactions')
      .update({ settled: nowSettled })
      .eq('id', t.id)
    setTxs(prev => prev.map(x => x.id === t.id ? { ...x, settled: nowSettled } : x))
  }, [])

  const delTx = useCallback(async (id) => {
    await supabase.from('transactions').delete().eq('id', id).eq('user_id', uid)
    setTxs(prev => prev.filter(x => x.id !== id))
  }, [uid])

  // split & compute
  const normalTxs  = txs.filter(t => !t.pending)
  const debtTxs    = txs.filter(t => t.pending)
  const pendingArr  = debtTxs.filter(t => !t.settled)
  const settledArr  = debtTxs.filter(t => t.settled)

  const income   = sum(normalTxs, t => t.amount > 0 ? t.amount : 0)
  const expense  = sum(normalTxs, t => t.amount < 0 ? t.amount : 0)
  const received = sum(settledArr, t => t.amount)
  const pendingTotal = sum(pendingArr, t => t.amount)
  const bal      = income + expense  // normal boxes: debt settlements don't affect balance directly

  const overdueN  = pendingArr.filter(t => t.due_date && new Date(t.due_date + 'T12:00') < new Date()).length
  const visibleNormal = expanded ? normalTxs : normalTxs.slice(0, 3)
  const extra         = normalTxs.length - 3

  return (
    <div
      ref={cardRef}
      className={`${s.boxCard}${isDebt ? ' ' + s.debtBox : ''}${focused ? ' ' + s.focused : ''}`}
      onClick={onFocus}
    >
      {/* header */}
      <div className={s.balCard}>
        <div>
          <div className={s.balLabel}>
            {box.name.toUpperCase()}
            {isDebt && <span className={s.typeTag}>dívidas</span>}
          </div>
          <div className={`${s.balAmount} ${
            isDebt
              ? pendingTotal > 0 ? s.pendingColor : s.zero
              : bal > 0 ? s.pos : bal < 0 ? s.neg : s.zero
          }`}>
            {isDebt
              ? fmt(pendingTotal)
              : (bal < 0 ? '−' : '') + fmt(bal)
            }
          </div>
          {isDebt && <div className={s.balSub}>a receber</div>}
        </div>
        <div className={s.balStats}>
          {isDebt ? <>
            {overdueN > 0 && <div className={s.overdueTag}>{overdueN} vencida{overdueN > 1 ? 's' : ''}</div>}
            <div>recebido <span className={s.inColor}>{fmt(received)}</span></div>
            <div>{pendingArr.length} pendente{pendingArr.length !== 1 ? 's' : ''}</div>
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
              if (isDebt) {
                if (e.key === 'Enter') { e.preventDefault(); document.getElementById(`dbt-${boxId}`)?.focus() }
              } else {
                if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); addTx(-1) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); addTx(1) }
              }
            }}
            onFocus={onFocus}
          />
        </div>

        {isDebt && (
          <div className={s.entryRow}>
            <input
              id={`dbt-${boxId}`} className={s.input} style={{ fontSize: '16px' }}
              placeholder="devedor" value={debtor}
              onChange={e => setDebtor(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && document.getElementById(`due-${boxId}`)?.focus()}
              onFocus={onFocus}
            />
            <input
              id={`due-${boxId}`} className={s.input}
              style={{ fontSize: '16px', flex: '0 0 130px' }}
              type="date" value={due}
              onChange={e => setDue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTx(1)}
              onFocus={onFocus}
            />
          </div>
        )}

        {isDebt
          ? <button className={`${s.btn} ${s.primary} ${s.full}`} onClick={() => addTx(1)}>+ registrar</button>
          : <div className={s.entryBtns}>
              <button className={`${s.btn} ${s.green}`} onClick={() => addTx(1)}>+ entrada</button>
              <button className={`${s.btn} ${s.danger}`} onClick={() => addTx(-1)}>− saída</button>
            </div>
        }
        {err && <p className={s.err}>{err}</p>}
      </div>

      {/* list */}
      <div className={s.txList}>
        {loading ? <div className={s.txLoading}>·</div> : isDebt ? (
          debtTxs.length === 0
            ? <div className={s.empty}>sem dívidas</div>
            : <>
                {pendingArr.map(t => <TxRow key={t.id} t={t} onToggle={toggleDebt} onDel={delTx} />)}
                {settledArr.length > 0 && <>
                  {pendingArr.length > 0 && <div className={s.divider}>recebidas</div>}
                  {settledArr.map(t => <TxRow key={t.id} t={t} onToggle={toggleDebt} onDel={delTx} />)}
                </>}
              </>
        ) : (
          normalTxs.length === 0
            ? <div className={s.empty}>sem lançamentos</div>
            : <>
                {visibleNormal.map(t => <TxRow key={t.id} t={t} onToggle={toggleDebt} onDel={delTx} />)}
                {extra > 0 && (
                  <button className={s.expandBtn} onClick={() => setExpanded(x => !x)}>
                    {expanded ? '▲' : `▼ ${extra} mais`}
                  </button>
                )}
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
  const [modal, setModal]           = useState(null)
  const [newBoxName, setNewBoxName] = useState('')
  const [newBoxType, setNewBoxType] = useState('normal')
  const [modalErr, setModalErr]     = useState('')
  const [focusedIdx, setFocusedIdx] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const cardRefs  = useRef([])
  const searchRef = useRef(null)
  const uid      = user.id
  const username = user.user_metadata?.username || user.email?.split('@')[0] || '—'

  useEffect(() => {
    supabase.from('boxes').select('id,name,type,created_at').eq('user_id', uid).order('created_at')
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
        if (modal) { setModal(null); return }
        if (confirmDelete) { setConfirmDelete(null); return }
        searchRef.current?.blur(); return
      }
      if (e.key === '/' && !inInput) { e.preventDefault(); searchRef.current?.focus(); return }
      if (modal || confirmDelete || inInput) return
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); navigate(1) }
      if (e.key === 'ArrowUp'   || e.key === 'k') { e.preventDefault(); navigate(-1) }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [modal, confirmDelete, navigate])

  const createBox = useCallback(async () => {
    setModalErr('')
    const name = newBoxName.trim()
    if (!name) { setModalErr('nome obrigatório'); return }
    if (boxes.find(b => b.name.toLowerCase() === name.toLowerCase())) { setModalErr('já existe'); return }
    const { data, error } = await supabase.from('boxes')
      .insert({ name, user_id: uid, type: newBoxType }).select('id,name,type,created_at').single()
    if (error) { setModalErr(error.message); return }
    setBoxes(prev => [...prev, data])
    setModal(null); setNewBoxName(''); setNewBoxType('normal')
  }, [newBoxName, newBoxType, boxes, uid])

  const deleteBox = useCallback(async (box) => {
    // transactions cascade via FK, just delete the box
    await supabase.from('boxes').delete().eq('id', box.id)
    setBoxes(prev => prev.filter(b => b.id !== box.id))
    setConfirmDelete(null)
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

      {/* modal: nova caixa */}
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
                onClick={() => setNewBoxType('normal')}>normal</button>
              <button
                className={`${s.typeBtn}${newBoxType === 'debt' ? ' ' + s.typeBtnDebt : ''}`}
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

      {/* modal: confirmar exclusão */}
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
