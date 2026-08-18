import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { HiOutlinePhotograph, HiOutlineVideoCamera, HiOutlineX } from 'react-icons/hi'
import { apiActionMessage } from '../../../shared/api/client'
import { mediaThumbnailUrl, uploadMedia } from '../../../shared/api/media'
import { ConfirmDialog, CustomSelect, DatePickerField, FloatingActionButton, MediaPreviewDialog, ToastMessage } from '../../../shared/components'
import { COMMON_CODE_GROUPS, DIARY_MOODS, DIARY_WEATHER_OPTIONS, SELECT_PLACEHOLDER_OPTION } from '../../../shared/constants/commonCodes'
import { useCommonCodeSelectOptions } from '../../../shared/hooks/useCommonCodeOptions'
import { currentTimeText, todayKey } from '../../../shared/utils/date'
import { createDiary, deleteDiary, listDiaries, updateDiary } from '../api/diary'
import type { DiaryItem, DiaryPayload } from '../types'
import './diary-page.css'

type ConfirmKind = 'save' | 'delete'
type DiaryQueryMode = 'month' | 'period'

const fallbackMoodOptions = [SELECT_PLACEHOLDER_OPTION, ...DIARY_MOODS.map((mood) => ({ label: mood, value: mood }))]
const fallbackWeatherOptions = [SELECT_PLACEHOLDER_OPTION, ...DIARY_WEATHER_OPTIONS.map((weather) => ({ label: weather, value: weather }))]
const maxMediaPerPost = 5

const emptyPayload = (): DiaryPayload => ({
  title: '',
  body: '',
  diaryDate: todayKey(),
  diaryTime: currentTimeText(),
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

function sanitizeTime(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

function tempText(item: DiaryItem) {
  const min = item.minTemperature
  const max = item.maxTemperature
  if (min == null && max == null) return ''
  if (min != null && max != null) return `최저 ${min}도 · 최고 ${max}도`
  return min != null ? `최저 ${min}도` : `최고 ${max}도`
}

function sortDiaries(items: DiaryItem[]) {
  return [...items].sort((a, b) => `${b.diaryDate} ${b.createdAt}`.localeCompare(`${a.diaryDate} ${a.createdAt}`))
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(year, monthNumber, 0).getDate()
  return { startDate: `${month}-01`, endDate: `${month}-${String(lastDay).padStart(2, '0')}` }
}

function registeredDateText(value: string) {
  return value ? value.slice(0, 10) : ''
}

function previewText(value?: string | null, limit = 80) {
  const normalized = (value || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return '내용 없음'
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized
}

function isVideoMedia(url: string) {
  return /\.(mp4|mov|webm|m4v|avi)(?:[?#]|$)/i.test(url)
}

export default function DiaryPage() {
  const moodSelectOptions = useCommonCodeSelectOptions(COMMON_CODE_GROUPS.diaryMoods, fallbackMoodOptions)
  const weatherSelectOptions = useCommonCodeSelectOptions(COMMON_CODE_GROUPS.diaryWeather, fallbackWeatherOptions)
  const currentDate = todayKey()
  const [queryMode, setQueryMode] = useState<DiaryQueryMode>('month')
  const [queryMonth, setQueryMonth] = useState(currentDate.slice(0, 7))
  const [periodStart, setPeriodStart] = useState(`${currentDate.slice(0, 7)}-01`)
  const [periodEnd, setPeriodEnd] = useState(currentDate)
  const [items, setItems] = useState<DiaryItem[]>([])
  const [form, setForm] = useState<DiaryPayload>(() => emptyPayload())
  const [pendingMediaFiles, setPendingMediaFiles] = useState<File[]>([])
  const [editing, setEditing] = useState<DiaryItem | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<DiaryItem | null>(null)
  const [pendingDelete, setPendingDelete] = useState<DiaryItem | null>(null)
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null)
  const [showDiaryFormDialog, setShowDiaryFormDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [mediaPreview, setMediaPreview] = useState<{ file?: File; url?: string; title: string; initialIndex?: number; items?: Array<{ file?: File; url?: string; title?: string }> } | null>(null)
  const formRef = useRef<HTMLFormElement | null>(null)
  const mediaInputRef = useRef<HTMLInputElement | null>(null)
  const diaryMutationInFlightRef = useRef(false)

  const range = useMemo(() => {
    if (queryMode === 'period') {
      return periodStart <= periodEnd
        ? { startDate: periodStart, endDate: periodEnd }
        : { startDate: periodEnd, endDate: periodStart }
    }
    return monthRange(queryMonth)
  }, [periodEnd, periodStart, queryMonth, queryMode])
  const diaryList = useMemo(() => sortDiaries(items), [items])

  async function reload() {
    setLoading(true)
    try {
      setItems(await listDiaries(range.startDate, range.endDate))
    } catch (error) {
      setToastMessage(apiActionMessage(error, '일기 목록을 불러오지 못했습니다.'))
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
    setPendingMediaFiles([])
    setShowDiaryFormDialog(false)
  }

  function startCreate() {
    setEditing(null)
    setForm(emptyPayload())
    setPendingMediaFiles([])
    setShowDiaryFormDialog(true)
    window.setTimeout(() => formRef.current?.querySelector('input')?.focus(), 0)
  }

  function startEdit(item: DiaryItem) {
    setSelectedDetail(null)
    setEditing(item)
    setForm({
      title: item.title,
      body: item.body || '',
      diaryDate: item.diaryDate,
      diaryTime: item.diaryTime?.slice(0, 5) || currentTimeText(),
      weather: item.weather || null,
      mood: item.mood || null,
      minTemperature: item.minTemperature ?? null,
      maxTemperature: item.maxTemperature ?? null,
      mediaUrls: item.mediaUrls || [],
    })
    setPendingMediaFiles([])
    setShowDiaryFormDialog(true)
    window.setTimeout(() => formRef.current?.querySelector('input')?.focus(), 0)
  }

  function addMediaFiles(files: FileList | null) {
    const selectedFiles = Array.from(files || [])
    const allowedFiles = selectedFiles.filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'))
    if (allowedFiles.length !== selectedFiles.length) {
      setToastMessage('사진 또는 영상 파일만 첨부할 수 있습니다.')
    }
    const remaining = Math.max(0, maxMediaPerPost - form.mediaUrls.length - pendingMediaFiles.length)
    const filesToAdd = allowedFiles.slice(0, remaining)
    if (filesToAdd.length < allowedFiles.length) {
      setToastMessage(`사진·영상은 기록 1건당 최대 ${maxMediaPerPost}개까지 등록할 수 있습니다.`)
    }
    if (filesToAdd.length) {
      setPendingMediaFiles((current) => [...current, ...filesToAdd])
      setMediaPreview({
        title: filesToAdd[0].name,
        items: filesToAdd.map((file) => ({ file, title: file.name })),
      })
    }
  }

  function removePendingMediaFile(index: number) {
    setPendingMediaFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  function removeSavedMedia(url: string) {
    setForm((current) => ({ ...current, mediaUrls: current.mediaUrls.filter((item) => item !== url) }))
  }

  function requestSave(event: FormEvent) {
    event.preventDefault()
    if (loading || confirmKind === 'save' || diaryMutationInFlightRef.current) return
    if (!form.title.trim()) {
      window.setTimeout(() => formRef.current?.querySelector<HTMLInputElement>('[data-required-field="diary-title"]')?.focus(), 0)
      setToastMessage('제목을 입력해주세요.')
      return
    }
    if (!form.diaryDate) {
      window.setTimeout(() => formRef.current?.querySelector<HTMLButtonElement>('.fp-diary-date-picker .date-picker-trigger')?.focus(), 0)
      setToastMessage('날짜를 선택해주세요.')
      return
    }
    if (!form.diaryTime || !/^\d{2}:\d{2}$/.test(form.diaryTime)) {
      window.setTimeout(() => formRef.current?.querySelector<HTMLInputElement>('[data-required-field="diary-time"]')?.focus(), 0)
      setToastMessage('시간은 HH:mm 형식으로 입력해주세요.')
      return
    }
    setConfirmKind('save')
  }

  async function saveDiary() {
    if (diaryMutationInFlightRef.current) return
    diaryMutationInFlightRef.current = true
    setLoading(true)
    try {
      const payload: DiaryPayload = {
        ...form,
        title: form.title.trim(),
        body: form.body.trim(),
        diaryTime: (form.diaryTime || currentTimeText()).slice(0, 5),
        weather: form.weather || null,
        mood: form.mood || null,
        minTemperature: form.minTemperature ?? null,
        maxTemperature: form.maxTemperature ?? null,
        mediaUrls: [...form.mediaUrls, ...(await Promise.all(pendingMediaFiles.map(async (file) => (await uploadMedia(file)).url)))],
      }
      const savedDiary = editing ? await updateDiary(editing.id, payload) : await createDiary(payload)
      setItems((current) => sortDiaries(editing
        ? current.map((item) => item.id === savedDiary.id ? savedDiary : item)
        : [savedDiary, ...current]))
      resetForm()
      setToastMessage(editing ? '일기를 수정했습니다.' : '일기를 저장했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, editing ? '일기 수정에 실패했습니다.' : '일기 저장에 실패했습니다.'))
    } finally {
      setConfirmKind(null)
      setLoading(false)
      diaryMutationInFlightRef.current = false
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    if (diaryMutationInFlightRef.current) return
    diaryMutationInFlightRef.current = true
    setLoading(true)
    try {
      await deleteDiary(pendingDelete.id)
      setItems((current) => current.filter((item) => item.id !== pendingDelete.id))
      if (editing?.id === pendingDelete.id) resetForm()
      setToastMessage('일기를 삭제했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, '일기 삭제에 실패했습니다.'))
    } finally {
      setConfirmKind(null)
      setPendingDelete(null)
      setLoading(false)
      diaryMutationInFlightRef.current = false
    }
  }

  return (
    <section className="fp-diary fp-card">
      {loading ? <div className="fp-loading-blocker">처리 중</div> : null}
      <header className="fp-diary-header">
        <div>
          <h2>일기</h2>
        </div>
        <div className="fp-diary-header-actions">
          <p>{diaryList.length}건</p>
          <button className="fp-button fp-button-primary fp-diary-add-button" type="button" onClick={startCreate}>입력</button>
        </div>
      </header>

      <section className="fp-diary-query-form fp-diary-filter">
        <div className={`fp-diary-query-row ${queryMode === 'period' ? 'period-mode' : 'day-mode'}`}>
          <div className="fp-diary-query-tabs" role="tablist" aria-label="일기 조회 방식">
            <button className={queryMode === 'month' ? 'active' : ''} type="button" onClick={() => setQueryMode('month')}>월별</button>
            <button className={queryMode === 'period' ? 'active' : ''} type="button" onClick={() => setQueryMode('period')}>기간별</button>
          </div>
          {queryMode === 'month' ? (
            <DatePickerField
              className="fp-diary-month-picker"
              label="조회 월"
              mode="month"
              showCalendarIcon
              value={queryMonth}
              onChange={setQueryMonth}
            />
          ) : (
            <div className="fp-diary-period-fields">
              <DatePickerField label="시작일" showCalendarIcon value={periodStart} onChange={setPeriodStart} />
              <DatePickerField label="종료일" showCalendarIcon value={periodEnd} onChange={setPeriodEnd} />
            </div>
          )}
        </div>
      </section>

      <div className="fp-diary-layout">
        <section className="fp-diary-list" aria-label="일기 목록">
          {diaryList.length ? diaryList.map((item) => (
            <article className="fp-diary-row" key={item.id} onClick={() => setSelectedDetail(item)}>
              <div className="fp-diary-row-copy">
                <div className="fp-diary-row-title-line">
                  <strong className="fp-ellipsis" title={item.title}>{item.title}</strong>
                  <time>{registeredDateText(item.createdAt)}</time>
                </div>
                <small>{[item.weather, item.mood, tempText(item)].filter(Boolean).join(' · ') || '날씨·기분·온도 정보 없음'}</small>
                <p title={item.body || ''}>{previewText(item.body)}</p>
              </div>
              <div className="fp-row-actions">
                <button type="button" onClick={(event) => { event.stopPropagation(); startEdit(item) }}>수정</button>
                <button
                  type="button"
                  className="danger"
                  onClick={(event) => {
                    event.stopPropagation()
                    setPendingDelete(item)
                    setConfirmKind('delete')
                  }}
                >
                  삭제
                </button>
              </div>
            </article>
          )) : <p className="fp-empty-text">{queryMode === 'month' ? '해당 월의 일기가 없습니다.' : '해당 기간의 일기가 없습니다.'}</p>}
        </section>
      </div>

      {!showDiaryFormDialog && !selectedDetail ? <FloatingActionButton ariaLabel="일기 추가" onClick={startCreate} /> : null}

      {selectedDetail ? (
        <div className="fp-diary-detail-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedDetail(null)
        }}>
          <section className="fp-diary-detail-dialog" role="dialog" aria-modal="true" aria-label="일기 상세">
            <header>
              <div>
                <h3>{selectedDetail.title}</h3>
                <time>{[selectedDetail.diaryDate, selectedDetail.diaryTime?.slice(0, 5)].filter(Boolean).join(' ')}</time>
              </div>
              <button className="fp-diary-close-button" type="button" aria-label="닫기" onClick={() => setSelectedDetail(null)}>
                <HiOutlineX aria-hidden="true" />
              </button>
            </header>
            <p className="fp-diary-detail-meta">{[selectedDetail.weather, selectedDetail.mood, tempText(selectedDetail)].filter(Boolean).join(' · ') || '날씨·기분·온도 정보 없음'}</p>
            <p className="fp-diary-detail-body">{selectedDetail.body || '내용 없음'}</p>
            {selectedDetail.mediaUrls?.length ? (
              <div className="fp-diary-detail-media" aria-label="첨부 미디어">
                {selectedDetail.mediaUrls.map((url, index) => (
                  <button className="fp-diary-media-preview" type="button" key={url} onClick={() => setMediaPreview({
                    title: `일기 첨부 ${index + 1}`,
                    initialIndex: index,
                    items: selectedDetail.mediaUrls.map((item, itemIndex) => ({ url: item, title: `일기 첨부 ${itemIndex + 1}` })),
                  })}>
                    {isVideoMedia(url) ? <video controls preload="metadata" src={url}>영상을 재생할 수 없습니다.</video> : <img alt="일기 첨부 사진" loading="lazy" decoding="async" src={mediaThumbnailUrl(url)} />}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="fp-diary-detail-actions">
              <button type="button" onClick={() => startEdit(selectedDetail)}>수정</button>
              <button type="button" className="danger" onClick={() => {
                setPendingDelete(selectedDetail)
                setConfirmKind('delete')
                setSelectedDetail(null)
              }}>삭제</button>
            </div>
          </section>
        </div>
      ) : null}

      {showDiaryFormDialog ? (
        <div
          className="fp-diary-form-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) resetForm()
          }}
        >
          <form className="fp-diary-form fp-diary-form-dialog fp-card" ref={formRef} onSubmit={requestSave}>
          <header>
            <h3>{editing ? '일기 수정' : '일기 추가'}</h3>
            <button className="fp-diary-close-button" type="button" aria-label="닫기" onClick={resetForm}>
              <HiOutlineX aria-hidden="true" />
            </button>
          </header>
          <div className="fp-diary-form-scroll">
            <div className="fp-form-grid">
              <label className="fp-field span-2">
                <span>제목 <em className="fp-required-mark">*</em></span>
                <input data-required-field="diary-title" value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} />
              </label>
              <DatePickerField
                className="fp-diary-date-picker"
                label="날짜"
                required
                showCalendarIcon
                value={form.diaryDate}
                onChange={(value) => setForm((current) => ({ ...current, diaryDate: value }))}
              />
              <label className="fp-field">
                <span>시간 <em className="fp-required-mark">*</em></span>
                <input data-required-field="diary-time" inputMode="numeric" maxLength={5} value={form.diaryTime || ''} onChange={(event) => setForm((current) => ({ ...current, diaryTime: sanitizeTime(event.target.value) || null }))} />
              </label>
              <CustomSelect
                label="날씨"
                options={weatherSelectOptions}
                value={form.weather || ''}
                onChange={(value) => setForm((current) => ({ ...current, weather: value || null }))}
              />
              <CustomSelect
                label="기분"
                options={moodSelectOptions}
                value={form.mood || ''}
                onChange={(value) => setForm((current) => ({ ...current, mood: value || null }))}
              />
              <label className="fp-field">
                <span>최저기온</span>
                <input inputMode="numeric" value={form.minTemperature ?? ''} onChange={(event) => setForm((value) => ({ ...value, minTemperature: numberOrNull(event.target.value) }))} />
              </label>
              <label className="fp-field">
                <span>최고기온</span>
                <input inputMode="numeric" value={form.maxTemperature ?? ''} onChange={(event) => setForm((value) => ({ ...value, maxTemperature: numberOrNull(event.target.value) }))} />
              </label>
              <label className="fp-field span-2">
                <span>내용</span>
                <textarea value={form.body} onChange={(event) => setForm((value) => ({ ...value, body: event.target.value }))} />
              </label>
              <div className="fp-field span-2 fp-diary-media-field">
                <span>사진·영상</span>
                <input
                  ref={mediaInputRef}
                  className="fp-diary-media-input"
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={(event) => {
                    addMediaFiles(event.target.files)
                    event.target.value = ''
                  }}
                />
                <button className="fp-diary-media-picker" type="button" disabled={loading || confirmKind === 'save'} onClick={() => mediaInputRef.current?.click()}>
                  <HiOutlinePhotograph aria-hidden="true" />
                  <HiOutlineVideoCamera aria-hidden="true" />
                  사진·영상 선택
                </button>
                {form.mediaUrls.length || pendingMediaFiles.length ? (
                  <ul className="fp-diary-media-list" aria-label="첨부 파일 목록">
                    {form.mediaUrls.map((url) => (
                      <li key={url}>
                        <span>{isVideoMedia(url) ? '영상' : '사진'} 첨부됨</span>
                        <button type="button" onClick={() => removeSavedMedia(url)}>삭제</button>
                      </li>
                    ))}
                    {pendingMediaFiles.map((file, index) => (
                      <li key={`${file.name}-${file.lastModified}-${index}`}>
                        <span>{file.type.startsWith('video/') ? '영상' : '사진'} · {file.name}</span>
                        <button type="button" onClick={() => removePendingMediaFile(index)}>삭제</button>
                      </li>
                    ))}
                  </ul>
                ) : <small>사진과 영상을 여러 개 선택할 수 있습니다.</small>}
              </div>
            </div>
          </div>
          <div className="fp-dialog-action-footer">
            <button className="fp-button fp-button-muted" type="button" onClick={resetForm} disabled={loading || confirmKind === 'save'}>취소</button>
            <button className="fp-button fp-button-primary fp-diary-submit-button" type="submit" disabled={loading || confirmKind === 'save'}>{editing ? '수정' : '저장'}</button>
          </div>
          </form>
        </div>
      ) : null}

      {confirmKind ? (
        <ConfirmDialog
          title={confirmKind === 'delete' ? '삭제' : editing ? '수정' : '저장'}
          body={confirmKind === 'delete' ? '일기를 삭제하시겠습니까?' : editing ? '일기를 수정하시겠습니까?' : '일기를 저장하시겠습니까?'}
          confirmLabel={confirmKind === 'delete' ? '삭제' : editing ? '수정' : '저장'}
          danger={confirmKind === 'delete'}
          busy={loading}
          busyLabel={confirmKind === 'delete' ? '삭제 중' : editing ? '수정 중' : '저장 중'}
          onCancel={() => {
            setConfirmKind(null)
            setPendingDelete(null)
          }}
          onConfirm={confirmKind === 'delete' ? confirmDelete : saveDiary}
        />
      ) : null}
      {mediaPreview ? <MediaPreviewDialog {...mediaPreview} onClose={() => setMediaPreview(null)} /> : null}
      <ToastMessage message={toastMessage} onClose={() => setToastMessage('')} />
    </section>
  )
}
