import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { apiActionMessage } from '../../../shared/api/client'
import { ConfirmDialog, CustomSelect, DatePickerField, ToastMessage } from '../../../shared/components'
import { TRAVEL_COST_CATEGORIES } from '../../../shared/constants/commonCodes'
import { currentTimeText, todayKey } from '../../../shared/utils/date'
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

function recordDateTime(record: TravelRecord) {
  return [record.recordDate, record.recordTime?.slice(0, 5)].filter(Boolean).join(' ')
}

function recordCostLine(record: TravelRecord) {
  return [record.category || '기타', money(record.amount), record.location].filter(Boolean).join(' · ')
}

export default function TravelPage() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const [records, setRecords] = useState<TravelRecord[]>([])
  const [tripForm, setTripForm] = useState<TripPayload>(() => emptyTrip())
  const [tripQueryInput, setTripQueryInput] = useState('')
  const [tripQuery, setTripQuery] = useState('')
  const [recordForm, setRecordForm] = useState<TravelRecordPayload>(() => emptyRecord())
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null)
  const [editingRecord, setEditingRecord] = useState<TravelRecord | null>(null)
  const [pendingTripDelete, setPendingTripDelete] = useState<Trip | null>(null)
  const [pendingRecordDelete, setPendingRecordDelete] = useState<TravelRecord | null>(null)
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null)
  const [loading, setLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [placeCandidates, setPlaceCandidates] = useState<PlaceSearchResult[]>([])
  const [placeSearching, setPlaceSearching] = useState(false)
  const tripNameInputRef = useRef<HTMLInputElement>(null)

  const sortedTripList = useMemo(() => sortedTrips(trips), [trips])
  const tripList = useMemo(() => {
    const query = tripQuery.trim().toLocaleLowerCase()
    if (!query) return sortedTripList
    return sortedTripList.filter((trip) => {
      const range = `${trip.startDate} ${trip.endDate}`
      return trip.title.toLocaleLowerCase().includes(query) || range.includes(query)
    })
  }, [sortedTripList, tripQuery])
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
      setRecordForm((value) => {
        if (value.title.trim() || value.location.trim() || value.note?.trim() || value.amount) return value
        return emptyRecord(nextOrder(nextRecords))
      })
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
    void reloadRecords(selectedTrip)
  }, [selectedTrip?.id])

  useEffect(() => {
    const query = recordForm.location.trim()
    if (query.length < 2) {
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
  }, [recordForm.location])

  function startTripEdit(trip: Trip) {
    setEditingTrip(trip)
    setTripForm({
      title: trip.title,
      startDate: trip.startDate,
      endDate: trip.endDate,
      description: trip.description || '',
    })
    window.setTimeout(() => tripNameInputRef.current?.focus(), 0)
  }

  function resetTripForm() {
    setEditingTrip(null)
    setTripForm(emptyTrip())
  }

  function requestTripSave(event: FormEvent) {
    event.preventDefault()
    if (!tripForm.title.trim()) {
      setToastMessage('여행명을 입력해주세요.')
      return
    }
    setConfirmKind('trip-save')
  }

  function requestTripSearch(event: FormEvent) {
    event.preventDefault()
    setTripQuery(tripQueryInput.trim())
  }

  async function confirmTripSave() {
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
      await reloadTrips()
      setToastMessage(editingTrip ? '여행을 수정했습니다.' : '여행을 추가했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, editingTrip ? '여행 수정에 실패했습니다.' : '여행 추가에 실패했습니다.'))
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
      category: record.category || TRAVEL_COST_CATEGORIES[0],
      amount: record.amount || 0,
      note: record.note || '',
      location: record.location || '',
      latitude: record.latitude || 0,
      longitude: record.longitude || 0,
      recordDate: record.recordDate,
      recordTime: record.recordTime?.slice(0, 5) || currentTimeText(),
      mediaUrls: record.mediaUrls || [],
    })
  }

  function resetRecordForm() {
    setEditingRecord(null)
    setRecordForm(emptyRecord(nextOrder(records)))
    setPlaceCandidates([])
  }

  function requestRecordSave(event: FormEvent) {
    event.preventDefault()
    if (!selectedTrip) return
    if (!recordForm.title.trim()) {
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
        category: recordForm.category || TRAVEL_COST_CATEGORIES[0],
        note: recordForm.note?.trim() || null,
        location: recordForm.location.trim(),
        recordTime: recordForm.recordTime?.slice(0, 5) || currentTimeText(),
      }
      if (editingRecord) await updateTravelRecord(editingRecord.id, payload)
      else await createTravelRecord(selectedTrip.id, payload)
      await reloadRecords(selectedTrip)
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
          <button className="fp-button fp-button-muted" type="button" onClick={() => setSelectedTrip(null)}>목록</button>
        </header>

        <div className="fp-travel-detail-layout">
          <section className="fp-travel-detail-main">
            <div className="fp-travel-summary">
              <article><span>총 사용금액</span><strong>{money(totalAmount)}</strong></article>
              <article><span>다음 순서</span><strong>{String(nextOrder(recordList)).padStart(2, '0')}</strong></article>
            </div>
            <TravelMap records={recordList} />
            <div className="fp-travel-record-list">
              {recordList.length ? recordList.map((record, index) => (
                <article className="fp-travel-record-card" key={record.id}>
                  <aside className="fp-travel-record-media">
                    <b>{String(record.sortOrder || index + 1).padStart(2, '0')}</b>
                    <span aria-hidden="true">▣</span>
                  </aside>
                  <div className="fp-travel-record-body">
                    <time>{recordDateTime(record)}</time>
                    <strong>{record.title}</strong>
                    {record.note ? <p>{record.note}</p> : null}
                    <small>{recordCostLine(record)}</small>
                  </div>
                  <div className="fp-row-actions fp-travel-record-actions">
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
              )) : <p className="fp-empty-text">등록된 여행 기록이 없습니다.</p>}
            </div>
          </section>

          <form className="fp-travel-record-form fp-card" onSubmit={requestRecordSave}>
            <header>
              <h3>{editingRecord ? '여행 기록 수정' : '여행 기록 추가'}</h3>
              {editingRecord ? <button className="fp-button fp-button-muted" type="button" onClick={resetRecordForm}>신규 입력</button> : null}
            </header>
            <div className="fp-form-grid travel-record-grid">
              <label className="fp-field">
                <span>순서</span>
                <input
                  inputMode="numeric"
                  value={recordForm.sortOrder || ''}
                  onChange={(event) => setRecordForm((value) => ({ ...value, sortOrder: Number(event.target.value.replace(/\D/g, '')) || null }))}
                />
              </label>
              <CustomSelect
                label="비용 구분"
                options={TRAVEL_COST_CATEGORIES.map((category) => ({ label: category, value: category }))}
                value={recordForm.category || TRAVEL_COST_CATEGORIES[0]}
                onChange={(value) => setRecordForm((current) => ({ ...current, category: value }))}
              />
              <label className="fp-field span-2">
                <span>제목 <em className="fp-required-mark">*</em></span>
                <input value={recordForm.title} onChange={(event) => setRecordForm((value) => ({ ...value, title: event.target.value }))} />
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
              <label className="fp-field span-2 fp-place-field">
                <span>위치</span>
                <input value={recordForm.location} onChange={(event) => setRecordForm((value) => ({ ...value, location: event.target.value, latitude: 0, longitude: 0 }))} />
                {placeSearching ? <span className="fp-place-status">위치를 검색하는 중입니다.</span> : null}
                {placeCandidates.length ? (
                  <div className="fp-place-candidates">
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
              <label className="fp-field">
                <span>사용금액</span>
                <input inputMode="numeric" value={formatNumberInput(recordForm.amount)} onChange={(event) => setRecordForm((value) => ({ ...value, amount: normalizeAmount(event.target.value) }))} />
              </label>
              <label className="fp-field span-2">
                <span>내용</span>
                <textarea value={recordForm.note || ''} onChange={(event) => setRecordForm((value) => ({ ...value, note: event.target.value }))} />
              </label>
            </div>
            <button className="fp-button fp-button-primary" type="submit">{editingRecord ? '수정' : '기록 추가'}</button>
          </form>
        </div>

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
        <p>{tripList.length}개</p>
      </header>
      <form className="fp-trip-query-form" onSubmit={requestTripSearch}>
        <strong>여행 조회</strong>
        <input
          aria-label="여행 조회"
          placeholder="여행명 또는 날짜"
          value={tripQueryInput}
          onChange={(event) => setTripQueryInput(event.target.value)}
        />
        <button className="fp-button fp-button-muted fp-trip-query-submit" type="submit">조회</button>
        {tripQuery ? (
          <button
            className="fp-button fp-button-muted fp-trip-query-reset"
            type="button"
            onClick={() => {
              setTripQuery('')
              setTripQueryInput('')
            }}
          >
            초기화
          </button>
        ) : null}
      </form>
      <form className="fp-trip-form" onSubmit={requestTripSave}>
        <label className="fp-field trip-title-field">
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
        <button className="fp-button fp-button-primary submit-action" type="submit">{editingTrip ? '저장' : '여행 추가'}</button>
        {editingTrip ? <button className="fp-button fp-button-muted cancel-action" type="button" onClick={resetTripForm}>취소</button> : null}
      </form>
      <div className="fp-trip-list">
        {tripList.length ? tripList.map((trip) => (
          <article className="fp-trip-row" key={trip.id}>
            <button className="fp-trip-row-main" type="button" onClick={() => setSelectedTrip(trip)}>
              <div>
                <strong>{trip.title}</strong>
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
        )) : <p className="fp-empty-text">{tripQuery ? '조회된 여행이 없습니다.' : '등록된 여행이 없습니다.'}</p>}
      </div>
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
