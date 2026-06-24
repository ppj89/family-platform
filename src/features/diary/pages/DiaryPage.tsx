import { FormEvent, useEffect, useMemo, useState } from 'react'
import { apiActionMessage } from '../../../shared/api/client'
import { ConfirmDialog } from '../../../shared/components'
import { monthInputValue, monthRange, parseDateKey, todayKey } from '../../../shared/utils/date'
import { createDiary, deleteDiary, listDiaries, updateDiary } from '../api/diary'
import type { DiaryItem, DiaryPayload } from '../types'
import './diary-page.css'

type ConfirmKind = 'save' | 'delete'

const moods = ['좋음', '보통', '힘듦', '기록']
const weatherOptions = ['맑음', '흐림', '비', '눈', '바람']

const emptyPayload = (): DiaryPayload => ({
  title: '',
  body: '',
  diaryDate: todayKey(),
  weather: null,
  mood: null,
  minTemperature: null,
  maxTemperature: null,
  mediaUrls: [],
})

function numberOrNull(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const next = Number(trimmed.replace(/[^\d.-]/g, ''))
  return Number.isFinite(next) ? next : null
}

function tempText(item: DiaryItem) {
  const min = item.minTemperature
  const max = item.maxTemperature
  if (min == null && max == null) return ''
  if (min != null && max != null) return `${min} / ${max}도`
  return min != null ? `최저 ${min}도` : `최고 ${max}도`
}

function sortDiaries(items: DiaryItem[]) {
  return [...items].sort((a, b) => `${b.diaryDate} ${b.createdAt}`.localeCompare(`${a.diaryDate} ${a.createdAt}`))
}

export default function DiaryPage() {
  const [monthDate, setMonthDate] = useState(() => new Date())
  const [items, setItems] = useState<DiaryItem[]>([])
  const [form, setForm] = useState<DiaryPayload>(() => emptyPayload())
  const [editing, setEditing] = useState<DiaryItem | null>(null)
  const [pendingDelete, setPendingDelete] = useState<DiaryItem | null>(null)
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const range = useMemo(() => monthRange(monthDate), [monthDate])
  const diaryList = useMemo(() => sortDiaries(items), [items])

  async function reload() {
    setLoading(true)
    setMessage('')
    try {
      setItems(await listDiaries(range.startDate, range.endDate))
    } catch (error) {
      setMessage(apiActionMessage(error, '일기 목록을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [range.startDate, range.endDate])

  function resetForm() {
    setEditing(null)
    setForm(emptyPayload())
  }

  function startEdit(item: DiaryItem) {
    setEditing(item)
    setForm({
      title: item.title,
      body: item.body || '',
      diaryDate: item.diaryDate,
      weather: item.weather || null,
      mood: item.mood || null,
      minTemperature: item.minTemperature ?? null,
      maxTemperature: item.maxTemperature ?? null,
      mediaUrls: item.mediaUrls || [],
    })
  }

  function requestSave(event: FormEvent) {
    event.preventDefault()
    if (!form.title.trim()) {
      setMessage('제목을 입력해주세요.')
      return
    }
    if (!form.diaryDate) {
      setMessage('날짜를 선택해주세요.')
      return
    }
    setConfirmKind('save')
  }

  async function confirmSave() {
    setLoading(true)
    setMessage('')
    try {
      const payload: DiaryPayload = {
        ...form,
        title: form.title.trim(),
        body: form.body.trim(),
        weather: form.weather || null,
        mood: form.mood || null,
        minTemperature: form.minTemperature ?? null,
        maxTemperature: form.maxTemperature ?? null,
      }
      if (editing) await updateDiary(editing.id, payload)
      else await createDiary(payload)
      await reload()
      resetForm()
      setMessage(editing ? '일기를 수정했습니다.' : '일기를 저장했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, editing ? '일기 수정에 실패했습니다.' : '일기 저장에 실패했습니다.'))
    } finally {
      setConfirmKind(null)
      setLoading(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setLoading(true)
    setMessage('')
    try {
      await deleteDiary(pendingDelete.id)
      await reload()
      if (editing?.id === pendingDelete.id) resetForm()
      setMessage('일기를 삭제했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, '일기 삭제에 실패했습니다.'))
    } finally {
      setConfirmKind(null)
      setPendingDelete(null)
      setLoading(false)
    }
  }

  return (
    <section className="fp-diary fp-card">
      {loading ? <div className="fp-loading-blocker">처리 중</div> : null}
      <header className="fp-diary-header">
        <div>
          <h2>일기</h2>
          <p>{diaryList.length}건</p>
        </div>
        <div className="fp-diary-actions">
          <label className="fp-field fp-month-field">
            조회 월
            <input
              type="month"
              value={monthInputValue(monthDate)}
              onChange={(event) => setMonthDate(parseDateKey(`${event.target.value}-01`))}
            />
          </label>
          <button className="fp-button fp-button-primary" type="button" onClick={reload}>조회</button>
        </div>
      </header>

      {message ? <p className="fp-message">{message}</p> : null}

      <div className="fp-diary-layout">
        <section className="fp-diary-list">
          {diaryList.length ? diaryList.map((item) => (
            <article className="fp-diary-row" key={item.id}>
              <div>
                <time>{item.diaryDate}</time>
                <strong>{item.title}</strong>
                <p>{item.body || '내용 없음'}</p>
                <small>{[item.weather, item.mood, tempText(item)].filter(Boolean).join(' · ')}</small>
              </div>
              <div className="fp-row-actions">
                <button type="button" onClick={() => startEdit(item)}>수정</button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    setPendingDelete(item)
                    setConfirmKind('delete')
                  }}
                >
                  삭제
                </button>
              </div>
            </article>
          )) : <p className="fp-empty-text">해당 월의 일기가 없습니다.</p>}
        </section>

        <form className="fp-diary-form fp-card" onSubmit={requestSave}>
          <header>
            <h3>{editing ? '일기 수정' : '일기 추가'}</h3>
            {editing ? <button className="fp-button fp-button-muted" type="button" onClick={resetForm}>취소</button> : null}
          </header>
          <div className="fp-form-grid">
            <label className="fp-field span-2">
              제목 *
              <input value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} />
            </label>
            <label className="fp-field">
              날짜 *
              <input type="date" value={form.diaryDate} onChange={(event) => setForm((value) => ({ ...value, diaryDate: event.target.value }))} />
            </label>
            <label className="fp-field">
              날씨
              <select value={form.weather || ''} onChange={(event) => setForm((value) => ({ ...value, weather: event.target.value || null }))}>
                <option value="">선택</option>
                {weatherOptions.map((weather) => <option key={weather} value={weather}>{weather}</option>)}
              </select>
            </label>
            <label className="fp-field">
              기분
              <select value={form.mood || ''} onChange={(event) => setForm((value) => ({ ...value, mood: event.target.value || null }))}>
                <option value="">선택</option>
                {moods.map((mood) => <option key={mood} value={mood}>{mood}</option>)}
              </select>
            </label>
            <label className="fp-field">
              최저기온
              <input inputMode="numeric" value={form.minTemperature ?? ''} onChange={(event) => setForm((value) => ({ ...value, minTemperature: numberOrNull(event.target.value) }))} />
            </label>
            <label className="fp-field">
              최고기온
              <input inputMode="numeric" value={form.maxTemperature ?? ''} onChange={(event) => setForm((value) => ({ ...value, maxTemperature: numberOrNull(event.target.value) }))} />
            </label>
            <label className="fp-field span-2">
              내용
              <textarea value={form.body} onChange={(event) => setForm((value) => ({ ...value, body: event.target.value }))} />
            </label>
          </div>
          <button className="fp-button fp-button-primary" type="submit">{editing ? '수정' : '저장'}</button>
        </form>
      </div>

      {confirmKind ? (
        <ConfirmDialog
          title={confirmKind === 'delete' ? '일기를 삭제할까요?' : editing ? '일기를 수정할까요?' : '일기를 저장할까요?'}
          body={confirmKind === 'delete' ? '선택한 일기를 삭제합니다.' : '입력한 내용을 일기에 반영합니다.'}
          confirmLabel={confirmKind === 'delete' ? '삭제' : '저장'}
          danger={confirmKind === 'delete'}
          onCancel={() => {
            setConfirmKind(null)
            setPendingDelete(null)
          }}
          onConfirm={confirmKind === 'delete' ? confirmDelete : confirmSave}
        />
      ) : null}
    </section>
  )
}
