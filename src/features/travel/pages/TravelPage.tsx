import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { HiOutlineX } from 'react-icons/hi'
import { apiActionMessage } from '../../../shared/api/client'
import { ConfirmDialog, CustomSelect, DatePickerField, FloatingActionButton, ToastMessage } from '../../../shared/components'
import { COMMON_CODE_GROUPS, TRAVEL_COST_CATEGORIES } from '../../../shared/constants/commonCodes'
import { useCommonCodeOptions } from '../../../shared/hooks'
import { currentTimeText, monthRange, parseDateKey, todayKey } from '../../../shared/utils/date'
import { formatNumberInput, normalizeAmount } from '../../../shared/utils/number'
import {
  createTravelRecord,
  createTrip,
  deleteTravelRecord,
  deleteTrip,
  listTravelRecords,
  listTrips,
  searchPlaces,
  updateTravelRecord,
  updateTrip,
} from '../api/travel'
import TravelMap from '../components/TravelMap'
import type { PlaceSearchResult, TravelRecord, TravelRecordPayload, Trip, TripPayload } from '../types'
import './travel-page.css'

type ConfirmKind = 'trip-save' | 'trip-delete' | 'record-save' | 'record-delete'
type TravelQueryMode = 'year' | 'month' | 'period'

const emptyTrip = (): TripPayload => ({
  title: '',
  startDate: todayKey(),
  endDate: todayKey(),
  description: '',
})

const emptyRecord = (order = 1): TravelRecordPayload => ({
  sortOrder: order,
  title: '',
  category: TRAVEL_COST_CATEGORIES[0],
  amount: 0,
  note: '',
  location: '',
  latitude: 0,
  longitude: 0,
  recordDate: todayKey(),
  recordTime: currentTimeText(),
  mediaUrls: [],
})

function money(value: number) {
  return `${Math.round(value || 0).toLocaleString('ko-KR')}원`
}

function sanitizeTime(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

function sortedTrips(items: Trip[]) {
  return [...items].sort((a, b) => `${b.startDate} ${b.createdAt}`.localeCompare(`${a.startDate} ${a.createdAt}`))
}

function sortedRecords(items: TravelRecord[]) {
  return [...items].sort((a, b) => (a.sortOrder || 9999) - (b.sortOrder || 9999) || a.recordDate.localeCompare(b.recordDate))
}

function nextOrder(records: TravelRecord[]) {
  const max = records.reduce((value, item) => Math.max(value, item.sortOrder || 0), 0)
  return max + 1
}

function recordShortDate(record: TravelRecord) {
  const [, month, day] = record.recordDate.split('-')
  return month && day ? `${month}.${day}` : record.recordDate
}

function recordSubLine(record: TravelRecord) {
  return [record.category || '기타', record.location].filter(Boolean).join(' · ')
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split('-')
  return `${year}년 ${Number(month)}월`
}

function overlapsRange(itemStart: string, itemEnd: string, rangeStart: string, rangeEnd: string) {
  const start = itemStart || itemEnd
  const end = itemEnd || itemStart
  return start <= rangeEnd && end >= rangeStart
}

export default function TravelPage() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const [records, setRecords] = useState<TravelRecord[]>([])
  const [tripForm, setTripForm] = useState<TripPayload>(() => emptyTrip())
  // Trips are naturally spread across months, so defaulting to "이번 달"
  // often showed "해당 기간의 여행이 없습니다" even when trips existed
  // elsewhere in the same year. Default to the broader year view instead.
  const [tripQueryMode, setTripQueryMode] = useState<TravelQueryMode>('year')
  const [tripYearValue, setTripYearValue] = useState(String(new Date().getFullYear()))
  const [tripMonthValue, setTripMonthValue] = useState(todayKey().slice(0, 7))
  const [tripPeriodStart, setTripPeriodStart] = useState(`${todayKey().slice(0, 7)}-01`)
  const [tripPeriodEnd, setTripPeriodEnd] = useState(todayKey())
  const [recordForm, setRecordForm] = useState<TravelRecordPayload>(() => emptyRecord())
  const [isTripFormOpen, setIsTripFormOpen] = useState(false)
  const [isRecordFormOpen, setIsRecordFormOpen] = useState(false)
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null)
  const [editingRecord, setEditingRecord] = useState<TravelRecord | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<TravelRecord | null>(null)
  const [pendingTripDelete, setPendingTripDelete] = useState<Trip | null>(null)
  const [pendingRecordDelete, setPendingRecordDelete] = useState<TravelRecord | null>(null)
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null)
  const [loading, setLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [placeCandidates, setPlaceCandidates] = useState<PlaceSearchResult[]>([])
  const [placeSearching, setPlaceSearching] = useState(false)
  const [isLocationFieldFocused, setIsLocationFieldFocused] = useState(false)
  const tripNameInputRef = useRef<HTMLInputElement>(null)
  const travelCostCategoryOptions = useCommonCodeOptions(COMMON_CODE_GROUPS.travelCostCategories, TRAVEL_COST_CATEGORIES)

  const sortedTripList = useMemo(() => sortedTrips(trips), [trips])
  const tripQueryRange = useMemo(() => {
    if (tripQueryMode === 'period') {
      return tripPeriodStart <= tripPeriodEnd
        ? { startDate: tripPeriodStart, endDate: tripPeriodEnd }
        : { startDate: tripPeriodEnd, endDate: tripPeriodStart }
    }
    if (tripQueryMode === 'year') {
      return { startDate: `${tripYearValue}-01-01`, endDate: `${tripYearValue}-12-31` }
    }
    return monthRange(parseDateKey(`${tripMonthValue}-01`))
  }, [tripMonthValue, tripPeriodEnd, tripPeriodStart, tripQueryMode, tripYearValue])
  const tripList = useMemo(() => {
    return sortedTripList.filter((trip) => overlapsRange(trip.startDate, trip.endDate, tripQueryRange.startDate, tripQueryRange.endDate))
  }, [sortedTripList, tripQueryRange])
  const recordList = useMemo(() => sortedRecords(records), [records])
  const totalAmount = useMemo(() => recordList.reduce((sum, item) => sum + (item.amount || 0), 0), [recordList])

  async function reloadTrips() {
    setLoading(true)
    setToastMessage('')
    try {
      setTrips(await listTrips())
    } catch (error) {
      setToastMessage(apiActionMessage(error, '여행 목록을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  async function reloadRecords(trip: Trip) {
    setLoading(true)
    setToastMessage('')
    try {
      const nextRecords = await listTravelRecords(trip.id)
      setRecords(nextRecords)
      setEditingRecord(null)
      // Always start the next add/edit form from a clean slate. This used
      // to only reset when the form looked untouched, meant to protect an
      // in-progress draft — but since the form now lives in a popup that's
      // fully closed after every save, that check just left the just-
      // submitted title (and its now-stale sortOrder) sitting in state,
      // so the very next "add" reused the same order number instead of
      // incrementing.
      setRecordForm(emptyRecord(nextOrder(nextRecords)))
    } catch (error) {
      setToastMessage(apiActionMessage(error, '여행 기록을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reloadTrips()
  }, [])

  useEffect(() => {
    if (!selectedTrip) return
    setIsRecordFormOpen(false)
    void reloadRecords(selectedTrip)
  }, [selectedTrip?.id])

  useEffect(() => {
    if (!isTripFormOpen) return
    window.setTimeout(() => tripNameInputRef.current?.focus(), 0)
  }, [isTripFormOpen])

  useEffect(() => {
    // Editing an existing record pre-fills this field with its saved
    // location, which used to trigger a search and pop the candidate list
    // open immediately — before the user had touched the field at all.
    // Only search while the field is actually focused.
    const query = recordForm.location.trim()
    if (!isLocationFieldFocused || query.length < 2) {
      setPlaceCandidates([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setPlaceSearching(true)
      try {
        const results = await searchPlaces(query, 6)
        if (!cancelled) setPlaceCandidates(results)
      } catch {
        if (!cancelled) setPlaceCandidates([])
      } finally {
        if (!cancelled) setPlaceSearching(false)
      }
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [recordForm.location, isLocationFieldFocused])

  function startTripEdit(trip: Trip) {
    setEditingTrip(trip)
    setTripForm({
      title: trip.title,
      startDate: trip.startDate,
      endDate: trip.endDate,
      description: trip.description || '',
    })
    setIsTripFormOpen(true)
  }

  function resetTripForm() {
    setEditingTrip(null)
    setTripForm(emptyTrip())
  }

  function openTripCreate() {
    resetTripForm()
    setIsTripFormOpen(true)
  }

  function closeTripForm() {
    resetTripForm()
    setIsTripFormOpen(false)
  }

  function requestTripSave(event: FormEvent) {
    event.preventDefault()
    if (!tripForm.title.trim()) {
      tripNameInputRef.current?.focus()
      setToastMessage('여행명을 입력해주세요.')
      return
    }
    setConfirmKind('trip-save')
  }

  async function confirmTripSave() {
    const isUpdate = Boolean(editingTrip)
    setLoading(true)
    setToastMessage('')
    try {
      const payload = {
        ...tripForm,
        title: tripForm.title.trim(),
        description: tripForm.description?.trim() || null,
      }
      if (editingTrip) await updateTrip(editingTrip.id, payload)
      else await createTrip(payload)
      resetTripForm()
      setIsTripFormOpen(false)
      await reloadTrips()
      setToastMessage(isUpdate ? '여행을 수정했습니다.' : '여행을 추가했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, isUpdate ? '여행 수정에 실패했습니다.' : '여행 추가에 실패했습니다.'))
    } finally {
      setConfirmKind(null)
      setLoading(false)
    }
  }

  async function confirmTripDelete() {
    if (!pendingTripDelete) return
    setLoading(true)
    setToastMessage('')
    try {
      await deleteTrip(pendingTripDelete.id)
      if (selectedTrip?.id === pendingTripDelete.id) setSelectedTrip(null)
      if (editingTrip?.id === pendingTripDelete.id) resetTripForm()
      if (editingTrip?.id === pendingTripDelete.id) setIsTripFormOpen(false)
      await reloadTrips()
      setToastMessage('여행을 삭제했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, '여행 삭제에 실패했습니다.'))
    } finally {
      setPendingTripDelete(null)
      setConfirmKind(null)
      setLoading(false)
    }
  }

  function selectPlace(place: PlaceSearchResult) {
    setRecordForm((value) => ({
      ...value,
      location: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
    }))
    setPlaceCandidates([])
  }

  function startRecordEdit(record: TravelRecord) {
    setEditingRecord(record)
    setRecordForm({
      sortOrder: record.sortOrder || nextOrder(records),
      title: record.title,
      category: record.category || travelCostCategoryOptions[0] || TRAVEL_COST_CATEGORIES[0],
      amount: record.amount || 0,
      note: record.note || '',
      location: record.location || '',
      latitude: record.latitude || 0,
      longitude: record.longitude || 0,
      recordDate: record.recordDate,
      recordTime: record.recordTime?.slice(0, 5) || currentTimeText(),
      mediaUrls: record.mediaUrls || [],
    })
    setIsRecordFormOpen(true)
  }

  function resetRecordForm() {
    setEditingRecord(null)
    setRecordForm(emptyRecord(nextOrder(records)))
    setPlaceCandidates([])
  }

  function openRecordCreate() {
    resetRecordForm()
    setIsRecordFormOpen(true)
  }

  function closeRecordForm() {
    resetRecordForm()
    setIsRecordFormOpen(false)
  }

  function requestRecordSave(event: FormEvent) {
    event.preventDefault()
    if (!selectedTrip) return
    if (!recordForm.title.trim()) {
      window.setTimeout(() => document.querySelector<HTMLInputElement>('[data-required-field="travel-record-title"]')?.focus(), 0)
      setToastMessage('제목을 입력해주세요.')
      return
    }
    if (!recordForm.recordDate || !recordForm.recordTime) {
      setToastMessage('날짜와 시간을 입력해주세요.')
      return
    }
    setConfirmKind('record-save')
  }

  async function confirmRecordSave() {
    if (!selectedTrip) return
    setLoading(true)
    setToastMessage('')
    try {
      const payload = {
        ...recordForm,
        title: recordForm.title.trim(),
        category: recordForm.category || travelCostCategoryOptions[0] || TRAVEL_COST_CATEGORIES[0],
        note: recordForm.note?.trim() || null,
        location: recordForm.location.trim(),
        recordTime: recordForm.recordTime?.slice(0, 5) || currentTimeText(),
      }
      if (editingRecord) await updateTravelRecord(editingRecord.id, payload)
      else await createTravelRecord(selectedTrip.id, payload)
      await reloadRecords(selectedTrip)
      setIsRecordFormOpen(false)
      setToastMessage(editingRecord ? '여행 기록을 수정했습니다.' : '여행 기록을 추가했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, editingRecord ? '여행 기록 수정에 실패했습니다.' : '여행 기록 추가에 실패했습니다.'))
    } finally {
      setConfirmKind(null)
      setLoading(false)
    }
  }

  async function confirmRecordDelete() {
    if (!selectedTrip || !pendingRecordDelete) return
    setLoading(true)
    setToastMessage('')
    try {
      await deleteTravelRecord(pendingRecordDelete.id)
      await reloadRecords(selectedTrip)
      setToastMessage('여행 기록을 삭제했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, '여행 기록 삭제에 실패했습니다.'))
    } finally {
      setPendingRecordDelete(null)
      setConfirmKind(null)
      setLoading(false)
    }
  }

  if (selectedTrip) {
    return (
      <section className="fp-travel">
        <ToastMessage message={toastMessage} onClose={() => setToastMessage('')} />
        {loading ? <div className="fp-loading-blocker">처리 중</div> : null}
        <header className="fp-travel-detail-header">
          <div>
            <h2>여행</h2>
            <p>{selectedTrip.startDate}{selectedTrip.endDate !== selectedTrip.startDate ? ` ~ ${selectedTrip.endDate}` : ''}</p>
          </div>
          <div className="fp-travel-list-actions">
            <button className="fp-button fp-button-primary" type="button" onClick={openRecordCreate}>입력</button>
            <button className="fp-button fp-button-muted" type="button" onClick={() => setSelectedTrip(null)}>목록</button>
          </div>
        </header>

        <section className="fp-travel-detail-main">
          <div className="fp-travel-summary">
            <article><span>총 사용금액</span><strong>{money(totalAmount)}</strong></article>
            <article><span>기록 수</span><strong>{recordList.length}건</strong></article>
          </div>
          <TravelMap records={recordList} />
          <div className="fp-travel-record-list">
            {recordList.length ? recordList.map((record, index) => (
              <button type="button" className="fp-travel-record-row" key={record.id} onClick={() => setSelectedRecord(record)}>
                <span className="fp-travel-record-order">{String(record.sortOrder || index + 1).padStart(2, '0')}</span>
                <span className="fp-travel-record-row-main">
                  <strong className="fp-ellipsis" title={record.title}>{record.title}</strong>
                  <span className="fp-travel-record-row-sub">{recordSubLine(record)}</span>
                </span>
                <span className="fp-travel-record-row-end">
                  <b>{money(record.amount)}</b>
                  <time>{recordShortDate(record)}</time>
                </span>
              </button>
            )) : <p className="fp-empty-text">등록된 여행 기록이 없습니다.</p>}
          </div>
        </section>

        {!isRecordFormOpen ? <FloatingActionButton ariaLabel="여행 기록 추가" onClick={openRecordCreate} /> : null}

        {selectedRecord ? (
          <div className="fp-travel-record-detail-backdrop" role="presentation" onClick={() => setSelectedRecord(null)}>
            <section className="fp-travel-record-detail-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="dialog-close" aria-label="닫기" onClick={() => setSelectedRecord(null)}>
                <HiOutlineX aria-hidden="true" />
              </button>
              <span className="fp-travel-record-detail-chip">{selectedRecord.category || '기타'}</span>
              <h2>{selectedRecord.title}</h2>
              <strong className="fp-travel-record-detail-amount">{money(selectedRecord.amount)}</strong>
              <dl>
                <div><dt>날짜</dt><dd>{selectedRecord.recordDate}</dd></div>
                <div><dt>시간</dt><dd>{selectedRecord.recordTime?.slice(0, 5) || '-'}</dd></div>
                <div><dt>카테고리</dt><dd>{selectedRecord.category || '기타'}</dd></div>
                <div><dt>위치</dt><dd>{selectedRecord.location || '-'}</dd></div>
              </dl>
              <TravelMap
                point={selectedRecord.latitude && selectedRecord.longitude ? { latitude: selectedRecord.latitude, longitude: selectedRecord.longitude, label: selectedRecord.location } : null}
                className="preview"
              />
              <div className="fp-travel-record-detail-note">
                <span>메모</span>
                <p>{selectedRecord.note || '메모가 없습니다.'}</p>
              </div>
              <div className="fp-travel-record-detail-actions">
                <button type="button" className="edit-button" onClick={() => { setSelectedRecord(null); startRecordEdit(selectedRecord) }}>수정</button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    setSelectedRecord(null)
                    setPendingRecordDelete(selectedRecord)
                    setConfirmKind('record-delete')
                  }}
                >
                  삭제
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {isRecordFormOpen ? (
          <div className="fp-travel-record-form-backdrop" role="presentation" onClick={closeRecordForm}>
            <section
              className="fp-travel-record-form-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="fp-travel-record-form-title"
              onClick={(event) => event.stopPropagation()}
            >
              <header>
                <h3 id="fp-travel-record-form-title">{editingRecord ? '여행 기록 수정' : '여행 기록 추가'}</h3>
                <div className="fp-travel-record-form-header-actions">
                  {editingRecord ? <button className="fp-button fp-button-muted" type="button" onClick={resetRecordForm}>신규 입력</button> : null}
                  <button type="button" aria-label="닫기" onClick={closeRecordForm}>
                    <HiOutlineX aria-hidden="true" />
                  </button>
                </div>
              </header>
              <form className="fp-travel-record-form" onSubmit={requestRecordSave}>
                <div className="fp-form-grid travel-record-grid">
                  <CustomSelect
                    label="비용 구분"
                    options={travelCostCategoryOptions.map((category) => ({ label: category, value: category }))}
                    value={recordForm.category || travelCostCategoryOptions[0] || TRAVEL_COST_CATEGORIES[0]}
                    onChange={(value) => setRecordForm((current) => ({ ...current, category: value }))}
                  />
                  <label className="fp-field span-2">
                    <span>제목 <em className="fp-required-mark">*</em></span>
                    <input data-required-field="travel-record-title" value={recordForm.title} onChange={(event) => setRecordForm((value) => ({ ...value, title: event.target.value }))} />
                  </label>
                  <DatePickerField
                    label="날짜"
                    required
                    value={recordForm.recordDate}
                    onChange={(value) => setRecordForm((current) => ({ ...current, recordDate: value }))}
                  />
                  <label className="fp-field">
                    <span>시간 <em className="fp-required-mark">*</em></span>
                    <input inputMode="numeric" maxLength={5} value={recordForm.recordTime || ''} onChange={(event) => setRecordForm((value) => ({ ...value, recordTime: sanitizeTime(event.target.value) }))} />
                  </label>
                  <label className="fp-field">
                    <span>사용금액</span>
                    <input inputMode="numeric" value={formatNumberInput(recordForm.amount)} onChange={(event) => setRecordForm((value) => ({ ...value, amount: normalizeAmount(event.target.value) }))} />
                  </label>
                  <label className="fp-field span-2 fp-place-field">
                    <span>위치</span>
                    <input
                      value={recordForm.location}
                      onChange={(event) => setRecordForm((value) => ({ ...value, location: event.target.value, latitude: 0, longitude: 0 }))}
                      onFocus={() => setIsLocationFieldFocused(true)}
                      onBlur={() => setIsLocationFieldFocused(false)}
                    />
                    {placeSearching ? <span className="fp-place-status">위치를 검색하는 중입니다.</span> : null}
                    {placeCandidates.length ? (
                      <div className="fp-place-candidates" onMouseDown={(event) => event.preventDefault()}>
                        {placeCandidates.map((place) => (
                          <button key={place.id} type="button" onClick={() => selectPlace(place)}>
                            <strong>{place.name}</strong>
                            <span>{place.address}</span>
                            <small>{place.source}</small>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </label>
                  <div className="span-2">
                    <TravelMap point={recordForm.latitude && recordForm.longitude ? { latitude: recordForm.latitude, longitude: recordForm.longitude, label: recordForm.location } : null} className="preview" />
                  </div>
                  <label className="fp-field span-2">
                    <span>내용</span>
                    <textarea value={recordForm.note || ''} onChange={(event) => setRecordForm((value) => ({ ...value, note: event.target.value }))} />
                  </label>
                </div>
                <div className="fp-dialog-action-footer">
                  <button className="fp-button fp-button-muted cancel-action" type="button" onClick={closeRecordForm}>취소</button>
                  <button className="fp-button fp-button-primary submit-action" type="submit">{editingRecord ? '수정' : '기록 추가'}</button>
                </div>
              </form>
            </section>
          </div>
        ) : null}

        {confirmKind === 'record-save' || confirmKind === 'record-delete' ? (
          <ConfirmDialog
            title={confirmKind === 'record-delete' ? '여행 기록 삭제' : '여행 기록 저장'}
            body={confirmKind === 'record-delete' ? '선택한 여행 기록을 삭제할까요?' : '여행 기록을 저장할까요?'}
            confirmLabel={confirmKind === 'record-delete' ? '삭제' : '저장'}
            danger={confirmKind === 'record-delete'}
            onCancel={() => {
              setConfirmKind(null)
              setPendingRecordDelete(null)
            }}
            onConfirm={confirmKind === 'record-delete' ? confirmRecordDelete : confirmRecordSave}
          />
        ) : null}
      </section>
    )
  }

  return (
    <section className="fp-card fp-travel fp-travel-list-panel">
      <ToastMessage message={toastMessage} onClose={() => setToastMessage('')} />
      {loading ? <div className="fp-loading-blocker">처리 중</div> : null}
      <header className="fp-travel-list-header">
        <div>
          <h2>여행</h2>
        </div>
        <div className="fp-travel-list-actions">
          <p>{tripList.length}개</p>
          <button className="fp-button fp-button-primary" type="button" onClick={openTripCreate}>입력</button>
        </div>
      </header>
      <section className="fp-trip-query-form fp-travel-filter">
        <div className={`fp-travel-query-row ${tripQueryMode === 'period' ? 'period-mode' : 'month-mode'}`}>
          <div className="fp-travel-query-tabs" role="tablist" aria-label="여행 조회 방식">
            <button className={tripQueryMode === 'year' ? 'active' : ''} type="button" onClick={() => setTripQueryMode('year')}>연도별</button>
            <button className={tripQueryMode === 'month' ? 'active' : ''} type="button" onClick={() => setTripQueryMode('month')}>월별</button>
            <button className={tripQueryMode === 'period' ? 'active' : ''} type="button" onClick={() => setTripQueryMode('period')}>기간별</button>
          </div>
          {tripQueryMode === 'year' ? (
            <DatePickerField
              className="fp-travel-month-picker"
              label="조회 연도"
              mode="year"
              showCalendarIcon
              value={tripYearValue}
              onChange={setTripYearValue}
            />
          ) : tripQueryMode === 'month' ? (
            <DatePickerField
              className="fp-travel-month-picker"
              displayValue={formatMonthLabel(tripMonthValue)}
              label="조회 월"
              mode="month"
              showCalendarIcon
              value={tripMonthValue}
              onChange={setTripMonthValue}
            />
          ) : (
            <div className="fp-travel-period-fields">
              <DatePickerField label="시작일" value={tripPeriodStart} onChange={setTripPeriodStart} />
              <DatePickerField label="종료일" value={tripPeriodEnd} onChange={setTripPeriodEnd} />
            </div>
          )}
        </div>
      </section>
      <div className="fp-trip-list">
        {tripList.length ? tripList.map((trip) => (
          <article className="fp-trip-row" key={trip.id}>
            <button className="fp-trip-row-main" type="button" onClick={() => setSelectedTrip(trip)}>
              <div>
                <strong className="fp-ellipsis" title={trip.title}>{trip.title}</strong>
                <span>{trip.startDate}{trip.endDate !== trip.startDate ? ` ~ ${trip.endDate}` : ''}</span>
              </div>
            </button>
            <div className="fp-row-actions">
              <button type="button" onClick={() => startTripEdit(trip)}>수정</button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setPendingTripDelete(trip)
                  setConfirmKind('trip-delete')
                }}
              >
                삭제
              </button>
            </div>
          </article>
        )) : <p className="fp-empty-text">해당 기간의 여행이 없습니다.</p>}
      </div>
      {!isTripFormOpen ? <FloatingActionButton ariaLabel="여행 추가" onClick={openTripCreate} /> : null}
      {isTripFormOpen ? (
        <div className="fp-trip-form-backdrop" role="presentation" onClick={closeTripForm}>
          <section
            className="fp-trip-form-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fp-trip-form-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2 id="fp-trip-form-title">{editingTrip ? '여행 수정' : '여행 추가'}</h2>
              <button type="button" aria-label="닫기" onClick={closeTripForm}>
                <HiOutlineX aria-hidden="true" />
              </button>
            </header>
            <form className="fp-trip-form" onSubmit={requestTripSave}>
              <div className="fp-trip-form-scroll">
              <label className="fp-field trip-title-field">
                <span>여행명 <em className="fp-required-mark">*</em></span>
                <input
                  ref={tripNameInputRef}
                  aria-label="여행명"
                  value={tripForm.title}
                  onChange={(event) => setTripForm((value) => ({ ...value, title: event.target.value }))}
                />
              </label>
              <DatePickerField
                className="travel-start-date"
                label="시작일"
                showCalendarIcon
                value={tripForm.startDate}
                onChange={(value) => setTripForm((current) => ({ ...current, startDate: value }))}
              />
              <DatePickerField
                className="travel-end-date"
                label="종료일"
                showCalendarIcon
                value={tripForm.endDate}
                onChange={(value) => setTripForm((current) => ({ ...current, endDate: value }))}
              />
              </div>
              <div className="fp-dialog-action-footer">
                <button className="fp-button fp-button-muted cancel-action" type="button" onClick={closeTripForm}>취소</button>
                <button className="fp-button fp-button-primary submit-action" type="submit">저장</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {confirmKind === 'trip-save' || confirmKind === 'trip-delete' ? (
        <ConfirmDialog
          title={confirmKind === 'trip-delete' ? '여행 삭제' : '여행 저장'}
          body={confirmKind === 'trip-delete' ? '선택한 여행과 기록을 삭제할까요?' : '여행을 저장할까요?'}
          confirmLabel={confirmKind === 'trip-delete' ? '삭제' : '저장'}
          danger={confirmKind === 'trip-delete'}
          onCancel={() => {
            setConfirmKind(null)
            setPendingTripDelete(null)
          }}
          onConfirm={confirmKind === 'trip-delete' ? confirmTripDelete : confirmTripSave}
        />
      ) : null}
    </section>
  )
}
