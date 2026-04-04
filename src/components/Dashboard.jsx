import { useState, useEffect, useCallback } from 'react'
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

export default function Dashboard({ user }) {
  const [boxes, setBoxes] = useState([])
  const [txs, setTxs] = useState([])
  const [activeBox, setActiveBox] = useState(null)
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [loading, setLoading] = useState(true)
  const [txLoading, setTxLoading] = useState(false)
  const [modal, setModal] = useState(null) // null | 'newbox' | 'delbox'
  const [newBoxName, setNewBoxName] = useState('')
  const [modalErr, setModalErr] = useState('')
  const [entryErr, setEntryErr] = useState('')

  const uid = user.id

  const loadBoxes = useCallback(async () => {
    const { data } = await supabase
      .from('boxes')
      .select('*')
      .eq('user_id', uid)
      .order('created_at')
    if (data) {
      setBoxes(data)
      if (!activeBox && data.length > 0) setActiveBox(data[0].id)
    }
    setLoading(false)
  }, [uid, activeBox])

  const loadTxs = useCallback(async (boxId) => {
    if (!boxId) return
    setTxLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('box_id', boxId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (data) setTxs(data)
    setTxLoading(false)
  }, [])

  useEffect(() => { loadBoxes() }, [])
  useEffect(() => { loadTxs(activeBox) }, [activeBox])

  async function addTx(sign) {
    setEntryErr('')
    const raw = amount.replace(',', '.')
    const v = parseFloat(raw)
    if (!raw || isNaN(v) || v <= 0) { setEntryErr('valor inválido'); return }
    const { error } = await supabase.from('transactions').insert({
      box_id: activeBox,
      user_id: uid,
      amount: sign * v,
      description: desc.trim() || null,
    })
    if (!error) {
      setAmount('')
      setDesc('')
      loadTxs(activeBox)
    }
  }

  async function delTx(id) {
    await supabase.from('transactions').delete().eq('id', id).eq('user_id', uid)
    setTxs(prev => prev.filter(t => t.id !== id))
  }

  async function createBox() {
    setModalErr('')
    const name = newBoxName.trim()
    if (!name) { setModalErr('nome obrigatório'); return }
    if (boxes.find(b => b.name.toLowerCase() === name.toLowerCase())) { setModalErr('já existe'); return }
    const { data, error } = await supabase.from('boxes').insert({ name, user_id: uid }).select().single()
    if (error) { setModalErr(error.message); return }
    setBoxes(prev => [...prev, data])
    setActiveBox(data.id)
    setModal(null)
    setNewBoxName('')
  }

  async function deleteBox() {
    await supabase.from('transactions').delete().eq('box_id', activeBox)
    await supabase.from('boxes').delete().eq('id', activeBox)
    const remaining = boxes.filter(b => b.id !== activeBox)
    setBoxes(remaining)
    setActiveBox(remaining[0]?.id || null)
    setTxs([])
    setModal(null)
  }

  const box = boxes.find(b => b.id === activeBox)
  const income = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const expense = txs.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)
  const bal = income + expense

  const username = user.user_metadata?.username || user.email?.split('@')[0] || '—'

  if (loading) return <div className={s.loading}>carregando...</div>

  return (
    <div className={s.wrap}>
      <div className={s.header}>
        <span className={s.logo}>// GRANA</span>
        <button className={s.logoutBtn} onClick={() => supabase.auth.signOut()}>
          {username} ×
        </button>
      </div>

      <div className={s.boxesBar}>
        {boxes.map(b => (
          <button
            key={b.id}
            className={`${s.boxTab}${b.id === activeBox ? ' ' + s.active : ''}`}
            onClick={() => setActiveBox(b.id)}
          >{b.name}</button>
        ))}
        <button className={`${s.boxTab} ${s.addBox}`} onClick={() => { setModal('newbox'); setNewBoxName(''); setModalErr('') }}>
          + caixa
        </button>
      </div>

      {box ? <>
        <div className={s.balCard}>
          <div>
            <div className={s.balLabel}>{box.name.toUpperCase()}</div>
            <div className={`${s.balAmount} ${bal > 0 ? s.pos : bal < 0 ? s.neg : s.zero}`}>
              {bal < 0 ? '-' : ''}{fmt(bal)}
            </div>
          </div>
          <div className={s.balStats}>
            <div>entrada <span className={s.inColor}>{fmt(income)}</span></div>
            <div>saída <span className={s.outColor}>{fmt(Math.abs(expense))}</span></div>
          </div>
        </div>

        <div className={s.entryForm}>
          <div className={s.entryRow}>
            <input
              className={s.input}
              style={{ flex: '0 0 120px' }}
              placeholder="valor"
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && document.getElementById('desc-input').focus()}
            />
            <input
              id="desc-input"
              className={s.input}
              placeholder="descrição"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTx(-1)}
            />
          </div>
          <div className={s.entryBtns}>
            <button className={`${s.btn} ${s.green}`} onClick={() => addTx(1)}>+ ENTRADA</button>
            <button className={`${s.btn} ${s.danger}`} onClick={() => addTx(-1)}>− SAÍDA</button>
          </div>
          {entryErr && <p className={s.err}>{entryErr}</p>}
        </div>

        <div className={s.txList}>
          {txLoading && <div className={s.loading}>...</div>}
          {!txLoading && txs.length === 0 && <div className={s.empty}>sem transações</div>}
          {txs.map(t => (
            <div key={t.id} className={`${s.txItem} ${t.amount > 0 ? s.txIn : s.txOut}`}>
              <div className={s.txLeft}>
                <span className={s.txDesc}>{t.description || '—'}</span>
                <span className={s.txMeta}>{timeAgo(t.created_at)}</span>
              </div>
              <span className={`${s.txAmt} ${t.amount > 0 ? s.inColor : s.outColor}`}>
                {t.amount > 0 ? '+' : '−'}{fmt(t.amount)}
              </span>
              <button className={s.delBtn} onClick={() => delTx(t.id)}>×</button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16 }}>
          <button className={`${s.btn} ${s.danger} ${s.small}`} onClick={() => setModal('delbox')}>
            apagar caixa
          </button>
        </div>
      </> : (
        <div className={s.empty} style={{ paddingTop: 48 }}>crie uma caixa para começar</div>
      )}

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
              onKeyDown={e => e.key === 'Enter' && createBox()}
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

      {modal === 'delbox' && box && (
        <div className={s.modalBg}>
          <div className={s.modal}>
            <h3 className={s.modalTitle}>// APAGAR CAIXA</h3>
            <p className={s.modalSub}>
              apagar <span style={{ color: 'var(--yellow2)' }}>{box.name}</span> e todas as transações?
            </p>
            <div className={s.modalBtns}>
              <button className={s.btn} onClick={() => setModal(null)}>cancelar</button>
              <button className={`${s.btn} ${s.danger}`} onClick={deleteBox}>apagar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
