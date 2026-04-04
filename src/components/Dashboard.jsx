import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import s from './Dashboard.module.css'

function fmt(n) {
  return 'R$\u00a0' + Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function BoxCard({ box, uid, onDelete, focused, onFocus, cardRef }) {
  const [txs, setTxs] = useState([])
  const [txLoading, setTxLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [entryErr, setEntryErr] = useState('')
  const amountRef = useRef(null)
  const descRef = useRef(null)

  const loadTxs = useCallback(async () => {
    setTxLoading(true)
    const { data } = await supabase
      .from('transactions').select('*').eq('box_id', box.id)
      .order('created_at', { ascending: false }).limit(100)
    if (data) setTxs(data)
    setTxLoading(false)
  }, [box.id])

  useEffect(() => { loadTxs() }, [loadTxs])

  useEffect(() => {
    if (focused) amountRef.current?.focus()
  }, [focused])

  async function addTx(sign) {
    setEntryErr('')
    const raw = amount.replace(',', '.')
    const v = parseFloat(raw)
    if (!raw || isNaN(v) || v <= 0) { setEntryErr('valor invalido'); return }
    const { error } = await supabase.from('transactions').insert({
      box_id: box.id, user_id: uid, amount: sign * v,
      description: desc.trim() || null,
    })
    if (!error) { setAmount(''); setDesc(''); loadTxs(); amountRef.current?.focus() }
  }

  async function delTx(id) {
    await supabase.from('transactions').delete().eq('id', id).eq('user_id', uid)
    setTxs(prev => prev.filter(t => t.id !== id))
  }

  const income = txs.filter(t => t.amount > 0).reduce((a, t) => a + t.amount, 0)
  const expense = txs.filter(t => t.amount < 0).reduce((a, t) => a + t.amount, 0)
  const bal = income + expense
  const visible = expanded ? txs : txs.slice(0, 3)
  const hasMore = txs.length > 3

  return (
    <div
      ref={cardRef}
      className={`${s.boxCard}${focused ? ' ' + s.boxCardFocused : ''}`}
      onClick={onFocus}
    >
      <div className={s.balCard}>
        <div>
          <div className={s.balLabel}>{box.name.toUpperCase()}</div>
          <div className={`${s.balAmount} ${bal > 0 ? s.pos : bal < 0 ? s.neg : s.zero}`}>
            {bal < 0 ? '-' : ''}{fmt(bal)}
          </div>
        </div>
        <div className={s.balStats}>
          <div>entrada <span className={s.inColor}>{fmt(income)}</span></div>
          <div>saida <span className={s.outColor}>{fmt(Math.abs(expense))}</span></div>
        </div>
      </div>

      <div className={s.entryForm}>
        <div className={s.entryRow}>
          <input
            ref={amountRef}
            className={s.input}
            style={{ flex: '0 0 120px', MozAppearance: 'textfield', WebkitAppearance: 'none', appearance: 'textfield' }}
            placeholder="valor"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value < 0 ? '' : e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); descRef.current?.focus() } }}
            onFocus={onFocus}
          />
          <input
            ref={descRef}
            className={s.input}
            placeholder="descricao  .  up entrada  down saida"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); addTx(-1) }
              if (e.key === 'ArrowUp') { e.preventDefault(); addTx(1) }
            }}
            onFocus={onFocus}
          />
        </div>
        <div className={s.entryBtns}>
          <button className={`${s.btn} ${s.green}`} onClick={() => addTx(1)}>+ ENTRADA</button>
          <button className={`${s.btn} ${s.danger}`} onClick={() => addTx(-1)}>- SAIDA</button>
        </div>
        {entryErr && <p className={s.err}>{entryErr}</p>}
      </div>

      <div className={s.txList}>
        {txLoading && <div className={s.loading}>...</div>}
        {!txLoading && txs.length === 0 && <div className={s.empty}>sem transacoes</div>}
        {visible.map(t => (
          <div key={t.id} className={`${s.txItem} ${t.amount > 0 ? s.txIn : s.txOut}`}>
            <div className={s.txLeft}>
              <span className={s.txDesc}>{t.description || '-'}</span>
              <span className={s.txMeta}>{timeAgo(t.created_at)}</span>
            </div>
            <span className={`${s.txAmt} ${t.amount > 0 ? s.inColor : s.outColor}`}>
              {t.amount > 0 ? '+' : '-'}{fmt(t.amount)}
            </span>
            <button className={s.delBtn} onClick={() => delTx(t.id)}>x</button>
          </div>
        ))}
        {hasMore && (
          <button className={s.expandBtn} onClick={() => setExpanded(x => !x)}>
            {expanded ? 'menos' : `+${txs.length - 3} transacoes`}
          </button>
        )}
      </div>

      <div className={s.boxFooter}>
        <button
          className={`${s.btn} ${s.danger} ${s.small}`}
          onClick={e => { e.stopPropagation(); onDelete(box) }}
        >apagar caixa</button>
      </div>
    </div>
  )
}

export default function Dashboard({ user }) {
  const [boxes, setBoxes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [newBoxName, setNewBoxName] = useState('')
  const [modalErr, setModalErr] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(0)
  const [pendingDelete, setPendingDelete] = useState(null)
  const cardRefs = useRef([])
  const searchRef = useRef(null)
  const uid = user.id
  const username = user.user_metadata?.username || user.email?.split('@')[0] || '-'

  const loadBoxes = useCallback(async () => {
    const { data } = await supabase
      .from('boxes').select('*').eq('user_id', uid).order('created_at')
    if (data) setBoxes(data)
    setLoading(false)
  }, [uid])

  useEffect(() => { loadBoxes() }, [loadBoxes])

  const filtered = boxes.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA'
      if (e.key === 'Escape') {
        if (modal) { setModal(null); return }
        if (pendingDelete) { setPendingDelete(null); return }
        searchRef.current?.blur(); return
      }
      if (e.key === '/' && !inInput) { e.preventDefault(); searchRef.current?.focus(); return }
      if (modal || pendingDelete || inInput) return
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        setFocusedIdx(i => {
          const next = Math.min(i + 1, filtered.length - 1)
          cardRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          return next
        })
      }
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        setFocusedIdx(i => {
          const prev = Math.max(i - 1, 0)
          cardRefs.current[prev]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          return prev
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal, pendingDelete, filtered.length])

  async function createBox() {
    setModalErr('')
    const name = newBoxName.trim()
    if (!name) { setModalErr('nome obrigatorio'); return }
    if (boxes.find(b => b.name.toLowerCase() === name.toLowerCase())) { setModalErr('ja existe'); return }
    const { data, error } = await supabase.from('boxes').insert({ name, user_id: uid }).select().single()
    if (error) { setModalErr(error.message); return }
    setBoxes(prev => [...prev, data])
    setModal(null); setNewBoxName('')
  }

  async function deleteBox(box) {
    await supabase.from('transactions').delete().eq('box_id', box.id)
    await supabase.from('boxes').delete().eq('id', box.id)
    setBoxes(prev => prev.filter(b => b.id !== box.id))
    setPendingDelete(null)
  }

  if (loading) return <div className={s.page}><div className={s.loading}>carregando...</div></div>

  return (
    <div className={s.page}>
      <div className={s.wrap}>
        <div className={s.header}>
          <span className={s.logo}>// ENCAIXE</span>
          <input
            ref={searchRef}
            className={`${s.input} ${s.searchInput}`}
            placeholder="buscar caixa  (/)"
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
              {username} x
            </button>
          </div>
        </div>

        <div className={s.hint}>
          <span>arriba/abaixo navegar</span>
          <span>arriba/abaixo no desc: lancar</span>
          <span>/ buscar</span>
          <span>esc fechar</span>
        </div>

        {filtered.length === 0 ? (
          <div className={s.empty} style={{ paddingTop: 48 }}>
            {boxes.length === 0 ? 'crie uma caixa para comecar' : 'nenhuma caixa encontrada'}
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
            <h3 className={s.modalTitle}>// NOVA CAIXA</h3>
            <input
              className={s.input}
              placeholder="nome da caixa"
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
            <h3 className={s.modalTitle}>// APAGAR CAIXA</h3>
            <p className={s.modalSub}>
              apagar <span style={{ color: 'var(--yellow2)' }}>{pendingDelete.name}</span> e todas as transacoes?
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
