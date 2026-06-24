import { Dispatch, FormEvent, SetStateAction, useEffect, useMemo, useState } from 'react'
import { apiActionMessage } from '../../../shared/api/client'
import { ConfirmDialog } from '../../../shared/components'
import { currentTimeText, todayKey } from '../../../shared/utils/date'
import { createBaby, createBabyRecord, deleteBaby, deleteBabyRecord, listBabies, listBabyRecords, updateBaby, updateBabyRecord } from '../api/baby'
import type { BabyPayload, BabyProfile, BabyRecord, BabyRecordPayload } from '../types'
import './baby-page.css'

type ConfirmKind = 'baby-save' | 'baby-delete' | 'record-save' | 'record-delete'

const recordTypes = ['수유', '대변', '소변', '수면', '성장', '병원', '메모']

const emptyBaby = (): BabyPayload => ({
  name: '',
  gender: null,
  birthDate: todayKey(),
  memo: '',
  photoUrl: null,
  latestHeightCm: null,
  latestWeightKg: null,
})

const emptyRecord = (): BabyRecordPayload => ({
  recordType: '수유',
  recordDate: todayKey(),
  recordTime: currentTimeText(),
  amountMl: null,
  heightCm: null,
  weightKg: null,
  memo: '',
  mediaUrls: [],
})

function numberOrNull(value: string) {
  const parsed = Number(value.replace(/[^\d.]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function sanitizeTime(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

function growthText(baby: BabyProfile) {
  return [baby.latestHeightCm ? `${baby.latestHeightCm}cm` : '', baby.latestWeightKg ? `${baby.latestWeightKg}kg` : ''].filter(Boolean).join(' · ') || '성장 기록 없음'
}

function recordMetrics(record: BabyRecord) {
  return [
    record.amountMl ? `${record.amountMl}ml` : '',
    record.heightCm ? `${record.heightCm}cm` : '',
    record.weightKg ? `${record.weightKg}kg` : '',
  ].filter(Boolean).join(' · ')
}

export default function BabyPage() {
  const [babies, setBabies] = useState<BabyProfile[]>([])
  const [selectedBaby, setSelectedBaby] = useState<BabyProfile | null>(null)
  const [records, setRecords] = useState<BabyRecord[]>([])
  const [babyForm, setBabyForm] = useState<BabyPayload>(() => emptyBaby())
  const [recordForm, setRecordForm] = useState<BabyRecordPayload>(() => emptyRecord())
  const [editingBaby, setEditingBaby] = useState<BabyProfile | null>(null)
  const [editingRecord, setEditingRecord] = useState<BabyRecord | null>(null)
  const [pendingBabyDelete, setPendingBabyDelete] = useState<BabyProfile | null>(null)
  const [pendingRecordDelete, setPendingRecordDelete] = useState<BabyRecord | null>(null)
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const sortedBabies = useMemo(() => [...babies].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [babies])
  const sortedRecords = useMemo(() => [...records].sort((a, b) => `${b.recordDate} ${b.createdAt}`.localeCompare(`${a.recordDate} ${a.createdAt}`)), [records])
  const growthRecords = useMemo(() => sortedRecords.filter((record) => record.heightCm || record.weightKg), [sortedRecords])
  const normalRecords = useMemo(() => sortedRecords.filter((record) => record.recordType !== '성장'), [sortedRecords])

  async function reloadBabies() {
    setLoading(true)
    setMessage('')
    try {
      setBabies(await listBabies())
    } catch (error) {
      setMessage(apiActionMessage(error, '아이 정보를 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  async function reloadRecords(baby: BabyProfile) {
    setLoading(true)
    setMessage('')
    try {
      setRecords(await listBabyRecords(baby.id))
      setEditingRecord(null)
      setRecordForm((value) => (value.memo || value.amountMl || value.heightCm || value.weightKg ? value : emptyRecord()))
    } catch (error) {
      setMessage(apiActionMessage(error, '육아 기록을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reloadBabies()
  }, [])

  useEffect(() => {
    if (!selectedBaby) return
    void reloadRecords(selectedBaby)
  }, [selectedBaby?.id])

  function startBabyEdit(baby: BabyProfile) {
    setEditingBaby(baby)
    setBabyForm({
      name: baby.name,
      gender: baby.gender || null,
      birthDate: baby.birthDate,
      memo: baby.memo || '',
      photoUrl: baby.photoUrl || null,
      latestHeightCm: baby.latestHeightCm || null,
      latestWeightKg: baby.latestWeightKg || null,
    })
  }

  function resetBabyForm() {
    setEditingBaby(null)
    setBabyForm(emptyBaby())
  }

  function requestBabySave(event: FormEvent) {
    event.preventDefault()
    if (!babyForm.name.trim() || !babyForm.gender || !babyForm.birthDate) {
      setMessage('이름, 성별, 생일을 입력해주세요.')
      return
    }
    setConfirmKind('baby-save')
  }

  async function confirmBabySave() {
    setLoading(true)
    setMessage('')
    try {
      const payload = { ...babyForm, name: babyForm.name.trim(), memo: babyForm.memo?.trim() || null }
      if (editingBaby) await updateBaby(editingBaby.id, payload)
      else await createBaby(payload)
      resetBabyForm()
      await reloadBabies()
      setMessage(editingBaby ? '아이 정보를 수정했습니다.' : '아이를 추가했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, editingBaby ? '아이 정보 수정에 실패했습니다.' : '아이 추가에 실패했습니다.'))
    } finally {
      setConfirmKind(null)
      setLoading(false)
    }
  }

  async function confirmBabyDelete() {
    if (!pendingBabyDelete) return
    setLoading(true)
    setMessage('')
    try {
      await deleteBaby(pendingBabyDelete.id)
      if (selectedBaby?.id === pendingBabyDelete.id) setSelectedBaby(null)
      await reloadBabies()
      setMessage('아이 정보를 삭제했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, '아이 삭제에 실패했습니다.'))
    } finally {
      setPendingBabyDelete(null)
      setConfirmKind(null)
      setLoading(false)
    }
  }

  function startRecordEdit(record: BabyRecord) {
    setEditingRecord(record)
    setRecordForm({
      recordType: record.recordType,
      recordDate: record.recordDate,
      recordTime: record.recordTime?.slice(0, 5) || currentTimeText(),
      amountMl: record.amountMl || null,
      heightCm: record.heightCm || null,
      weightKg: record.weightKg || null,
      memo: record.memo || '',
      mediaUrls: record.mediaUrls || [],
    })
  }

  function requestRecordSave(event: FormEvent) {
    event.preventDefault()
    if (!selectedBaby) return
    if (!recordForm.recordType || !recordForm.recordDate) {
      setMessage('기록 종류와 날짜를 입력해주세요.')
      return
    }
    setConfirmKind('record-save')
  }

  async function confirmRecordSave() {
    if (!selectedBaby) return
    setLoading(true)
    setMessage('')
    try {
      const payload = {
        ...recordForm,
        memo: recordForm.memo?.trim() || null,
        recordTime: recordForm.recordTime?.slice(0, 5) || currentTimeText(),
      }
      if (editingRecord) await updateBabyRecord(editingRecord.id, payload)
      else await createBabyRecord(selectedBaby.id, payload)
      setRecordForm(emptyRecord())
      await reloadRecords(selectedBaby)
      await reloadBabies()
      setMessage(editingRecord ? '육아 기록을 수정했습니다.' : '육아 기록을 추가했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, editingRecord ? '육아 기록 수정에 실패했습니다.' : '육아 기록 추가에 실패했습니다.'))
    } finally {
      setConfirmKind(null)
      setLoading(false)
    }
  }

  async function confirmRecordDelete() {
    if (!selectedBaby || !pendingRecordDelete) return
    setLoading(true)
    setMessage('')
    try {
      await deleteBabyRecord(pendingRecordDelete.id)
      await reloadRecords(selectedBaby)
      setMessage('육아 기록을 삭제했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, '육아 기록 삭제에 실패했습니다.'))
    } finally {
      setPendingRecordDelete(null)
      setConfirmKind(null)
      setLoading(false)
    }
  }

  return (
    <section className="fp-card fp-baby">
      {loading ? <div className="fp-loading-blocker">처리 중</div> : null}
      <header className="fp-baby-header">
        <div>
          <h2>육아 기록</h2>
          <p>수유, 배변, 성장, 병원 기록</p>
        </div>
        {selectedBaby ? <button className="fp-button fp-button-muted" type="button" onClick={() => setSelectedBaby(null)}>목록</button> : null}
      </header>
      {message ? <p className="fp-message">{message}</p> : null}

      {!selectedBaby ? (
        <div className="fp-baby-layout">
          <section className="fp-baby-list">
            {sortedBabies.length ? sortedBabies.map((baby) => (
              <article className="fp-baby-card" key={baby.id}>
                <button type="button" onClick={() => setSelectedBaby(baby)}>
                  <span>아이</span>
                  <strong>{baby.name}</strong>
                  <small>{[baby.gender || '', baby.birthDate].filter(Boolean).join(' · ')}</small>
                  <b>{growthText(baby)}</b>
                </button>
                <div className="fp-row-actions">
                  <button type="button" onClick={() => startBabyEdit(baby)}>수정</button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      setPendingBabyDelete(baby)
                      setConfirmKind('baby-delete')
                    }}
                  >
                    삭제
                  </button>
                </div>
              </article>
            )) : <p className="fp-empty-text">등록된 아이가 없습니다.</p>}
          </section>
          <BabyForm form={babyForm} editing={Boolean(editingBaby)} onSubmit={requestBabySave} onReset={resetBabyForm} setForm={setBabyForm} />
        </div>
      ) : (
        <div className="fp-baby-detail-layout">
          <section className="fp-baby-detail-main">
            <article className="fp-baby-profile">
              <span>아이</span>
              <div>
                <strong>{selectedBaby.name}</strong>
                <small>{[selectedBaby.gender || '', selectedBaby.birthDate].filter(Boolean).join(' · ')}</small>
                <b>{growthText(selectedBaby)}</b>
              </div>
            </article>
            <section className="fp-baby-growth">
              <h3>성장 기록</h3>
              <div className="fp-baby-growth-list">
                {growthRecords.length ? growthRecords.map((record, index) => (
                  <article key={record.id}>
                    <strong>{index + 1}. {record.recordDate}</strong>
                    <span>{[record.heightCm ? `${record.heightCm}cm` : '', record.weightKg ? `${record.weightKg}kg` : ''].filter(Boolean).join(' · ')}</span>
                  </article>
                )) : <p className="fp-empty-text">성장 기록이 없습니다.</p>}
              </div>
            </section>
            <section className="fp-baby-record-list">
              <h3>기록</h3>
              {normalRecords.length ? normalRecords.map((record) => (
                <article className="fp-baby-record-row" key={record.id}>
                  <div>
                    <strong>{record.recordType}</strong>
                    <span>{[record.recordDate, record.recordTime?.slice(0, 5), recordMetrics(record)].filter(Boolean).join(' · ')}</span>
                    {record.memo ? <p>{record.memo}</p> : null}
                  </div>
                  <div className="fp-row-actions">
                    <button type="button" onClick={() => startRecordEdit(record)}>수정</button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        setPendingRecordDelete(record)
                        setConfirmKind('record-delete')
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </article>
              )) : <p className="fp-empty-text">등록된 육아 기록이 없습니다.</p>}
            </section>
          </section>
          <RecordForm form={recordForm} editing={Boolean(editingRecord)} setForm={setRecordForm} onSubmit={requestRecordSave} onReset={() => { setEditingRecord(null); setRecordForm(emptyRecord()) }} />
        </div>
      )}

      {confirmKind ? (
        <ConfirmDialog
          title={confirmKind.includes('delete') ? '삭제 확인' : '저장 확인'}
          body={confirmKind.includes('delete') ? '선택한 데이터를 삭제할까요?' : '입력한 내용을 저장할까요?'}
          confirmLabel={confirmKind.includes('delete') ? '삭제' : '저장'}
          danger={confirmKind.includes('delete')}
          onCancel={() => {
            setConfirmKind(null)
            setPendingBabyDelete(null)
            setPendingRecordDelete(null)
          }}
          onConfirm={
            confirmKind === 'baby-save' ? confirmBabySave
              : confirmKind === 'baby-delete' ? confirmBabyDelete
                : confirmKind === 'record-save' ? confirmRecordSave
                  : confirmRecordDelete
          }
        />
      ) : null}
    </section>
  )
}

function BabyForm({ form, editing, setForm, onSubmit, onReset }: {
  form: BabyPayload
  editing: boolean
  setForm: Dispatch<SetStateAction<BabyPayload>>
  onSubmit: (event: FormEvent) => void
  onReset: () => void
}) {
  return (
    <form className="fp-baby-form" onSubmit={onSubmit}>
      <header><h3>{editing ? '아이 정보 수정' : '아이 추가'}</h3>{editing ? <button className="fp-button fp-button-muted" type="button" onClick={onReset}>취소</button> : null}</header>
      <div className="fp-form-grid">
        <label className="fp-field">이름 *<input value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} /></label>
        <label className="fp-field">성별 *<select value={form.gender || ''} onChange={(event) => setForm((value) => ({ ...value, gender: event.target.value || null }))}><option value="">선택</option><option value="남">남</option><option value="여">여</option></select></label>
        <label className="fp-field">생일 *<input type="date" value={form.birthDate} onChange={(event) => setForm((value) => ({ ...value, birthDate: event.target.value }))} /></label>
        <label className="fp-field">키(cm)<input inputMode="decimal" value={form.latestHeightCm || ''} onChange={(event) => setForm((value) => ({ ...value, latestHeightCm: numberOrNull(event.target.value) }))} /></label>
        <label className="fp-field">몸무게(kg)<input inputMode="decimal" value={form.latestWeightKg || ''} onChange={(event) => setForm((value) => ({ ...value, latestWeightKg: numberOrNull(event.target.value) }))} /></label>
        <label className="fp-field span-2">메모<textarea value={form.memo || ''} onChange={(event) => setForm((value) => ({ ...value, memo: event.target.value }))} /></label>
      </div>
      <button className="fp-button fp-button-primary" type="submit">{editing ? '저장' : '아이 추가'}</button>
    </form>
  )
}

function RecordForm({ form, editing, setForm, onSubmit, onReset }: {
  form: BabyRecordPayload
  editing: boolean
  setForm: Dispatch<SetStateAction<BabyRecordPayload>>
  onSubmit: (event: FormEvent) => void
  onReset: () => void
}) {
  return (
    <form className="fp-baby-form fp-baby-record-form" onSubmit={onSubmit}>
      <header><h3>{editing ? '기록 수정' : '새 기록 추가'}</h3>{editing ? <button className="fp-button fp-button-muted" type="button" onClick={onReset}>신규 입력</button> : null}</header>
      <div className="fp-form-grid">
        <label className="fp-field">기록종류<select value={form.recordType} onChange={(event) => setForm((value) => ({ ...value, recordType: event.target.value }))}>{recordTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label className="fp-field">날짜 *<input type="date" value={form.recordDate} onChange={(event) => setForm((value) => ({ ...value, recordDate: event.target.value }))} /></label>
        <label className="fp-field">시간<input inputMode="numeric" maxLength={5} value={form.recordTime || ''} onChange={(event) => setForm((value) => ({ ...value, recordTime: sanitizeTime(event.target.value) }))} /></label>
        <label className="fp-field">수유량(ml)<input inputMode="numeric" value={form.amountMl || ''} onChange={(event) => setForm((value) => ({ ...value, amountMl: numberOrNull(event.target.value) }))} /></label>
        <label className="fp-field">키(cm)<input inputMode="decimal" value={form.heightCm || ''} onChange={(event) => setForm((value) => ({ ...value, heightCm: numberOrNull(event.target.value) }))} /></label>
        <label className="fp-field">몸무게(kg)<input inputMode="decimal" value={form.weightKg || ''} onChange={(event) => setForm((value) => ({ ...value, weightKg: numberOrNull(event.target.value) }))} /></label>
        <label className="fp-field span-2">메모<textarea value={form.memo || ''} onChange={(event) => setForm((value) => ({ ...value, memo: event.target.value }))} /></label>
      </div>
      <button className="fp-button fp-button-primary" type="submit">{editing ? '저장' : '기록 추가'}</button>
    </form>
  )
}
