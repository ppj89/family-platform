import { FormEvent, useEffect, useMemo, useState } from 'react'
import { HiOutlineX } from 'react-icons/hi'
import { apiActionMessage } from '../../../shared/api/client'
import { ConfirmDialog, CustomSelect, DatePickerField, FloatingActionButton, ToastMessage } from '../../../shared/components'
import {
  COMMON_CODE_GROUPS,
  RESTAURANT_RATING_OPTIONS,
} from '../../../shared/constants/commonCodes'
import { useCommonCodeSelectOptions } from '../../../shared/hooks/useCommonCodeOptions'
import { todayKey } from '../../../shared/utils/date'
import { formatNumberInput } from '../../../shared/utils/number'
import TravelMap from '../../travel/components/TravelMap'
import { createRestaurant, deleteRestaurant, listRestaurants, searchPlaces, updateRestaurant } from '../api/restaurant'
import type { PlaceSearchResult, RestaurantItem, RestaurantPayload } from '../types'
import './restaurant-page.css'

type ConfirmKind = 'save' | 'delete'

const emptyPayload = (): RestaurantPayload => ({
  name: '',
  menu: '',
  price: null,
  rating: 5,
  visitDate: todayKey(),
  location: '',
  address: '',
  latitude: null,
  longitude: null,
  memo: '',
  mediaUrls: [],
})

function numberOrNull(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const next = Number(trimmed.replace(/[^\d.-]/g, ''))
  return Number.isFinite(next) ? next : null
}

function formatMoney(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return ''
  return `${Math.round(value).toLocaleString('ko-KR')}원`
}

function formatDate(value: string) {
  return value ? value.replace(/-/g, '.') : ''
}

function sortRestaurants(items: RestaurantItem[]) {
  return [...items].sort((a, b) => `${b.visitDate} ${b.createdAt}`.localeCompare(`${a.visitDate} ${a.createdAt}`))
}

export default function RestaurantPage() {
  const ratingOptions = useCommonCodeSelectOptions(COMMON_CODE_GROUPS.restaurantRatings, RESTAURANT_RATING_OPTIONS)
  const [items, setItems] = useState<RestaurantItem[]>([])
  const [form, setForm] = useState<RestaurantPayload>(() => emptyPayload())
  const [editing, setEditing] = useState<RestaurantItem | null>(null)
  const [pendingDelete, setPendingDelete] = useState<RestaurantItem | null>(null)
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null)
  const [showRestaurantFormDialog, setShowRestaurantFormDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [placeCandidates, setPlaceCandidates] = useState<PlaceSearchResult[]>([])
  const [placeSearching, setPlaceSearching] = useState(false)

  const restaurantList = useMemo(() => sortRestaurants(items), [items])

  async function reload() {
    setLoading(true)
    try {
      setItems(await listRestaurants())
    } catch (error) {
      setToastMessage(apiActionMessage(error, '맛집 목록을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  useEffect(() => {
    const query = (form.location || '').trim()
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
  }, [form.location])

  function resetForm() {
    setEditing(null)
    setForm(emptyPayload())
    setPlaceCandidates([])
    setShowRestaurantFormDialog(false)
  }

  function startCreate() {
    resetForm()
    setShowRestaurantFormDialog(true)
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('.fp-restaurant-form input')?.focus()
    })
  }

  function startEdit(item: RestaurantItem) {
    setEditing(item)
    setForm({
      name: item.name,
      menu: item.menu || '',
      price: item.price ?? null,
      rating: item.rating ?? 5,
      visitDate: item.visitDate,
      location: item.location || '',
      address: item.address || '',
      latitude: item.latitude ?? null,
      longitude: item.longitude ?? null,
      memo: item.memo || '',
      mediaUrls: item.mediaUrls || [],
    })
    setShowRestaurantFormDialog(true)
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('.fp-restaurant-form input')?.focus()
    })
  }

  function selectPlace(place: PlaceSearchResult) {
    setForm((value) => ({
      ...value,
      location: place.name,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
    }))
    setPlaceCandidates([])
  }

  function requestSave(event: FormEvent) {
    event.preventDefault()
    if (!form.name.trim()) {
      setToastMessage('상호명을 입력해주세요.')
      return
    }
    if (!form.visitDate) {
      setToastMessage('방문일을 선택해주세요.')
      return
    }
    setConfirmKind('save')
  }

  async function confirmSave() {
    setLoading(true)
    try {
      const payload: RestaurantPayload = {
        ...form,
        name: form.name.trim(),
        menu: form.menu?.trim() || null,
        location: form.location?.trim() || null,
        address: form.address?.trim() || null,
        memo: form.memo?.trim() || null,
        latitude: form.latitude || null,
        longitude: form.longitude || null,
      }

      if (editing) await updateRestaurant(editing.id, payload)
      else await createRestaurant(payload)

      await reload()
      resetForm()
      setToastMessage(editing ? '맛집을 수정했습니다.' : '맛집을 추가했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, editing ? '맛집 수정에 실패했습니다.' : '맛집 추가에 실패했습니다.'))
    } finally {
      setConfirmKind(null)
      setLoading(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setLoading(true)
    try {
      await deleteRestaurant(pendingDelete.id)
      await reload()
      if (editing?.id === pendingDelete.id) resetForm()
      setToastMessage('맛집을 삭제했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, '맛집 삭제에 실패했습니다.'))
    } finally {
      setConfirmKind(null)
      setPendingDelete(null)
      setLoading(false)
    }
  }

  return (
    <section className="fp-restaurant">
      {loading ? <div className="fp-loading-blocker">처리 중</div> : null}

      <div className="fp-restaurant-layout">
        <article className="fp-restaurant-main fp-card">
          <header className="fp-restaurant-card-header">
            <h2>맛집</h2>
            <div className="fp-restaurant-card-actions">
              <span className="fp-restaurant-count">{restaurantList.length}곳</span>
              <button className="fp-restaurant-input-button" type="button" onClick={startCreate}>맛집 추가</button>
            </div>
          </header>

          <div className="fp-restaurant-summary">
            <div>
              <span>방문한 곳</span>
              <strong>함께 기록한 맛집</strong>
            </div>
          </div>

          <div className="fp-restaurant-list">
            {restaurantList.length ? restaurantList.map((item) => (
              <article className="fp-restaurant-row" key={item.id}>
                <div className="fp-restaurant-empty-photo" aria-hidden="true">
                  <span>맛집</span>
                </div>
                <div className="fp-restaurant-row-main">
                  <div className="fp-restaurant-row-top">
                    <strong className="fp-ellipsis" title={item.name || '상호명'}>{item.name || '상호명'}</strong>
                    {item.rating ? <span>★ {item.rating}</span> : null}
                  </div>
                  <p>{item.menu || item.location || item.address || '대표 메뉴를 입력해주세요.'}</p>
                  <div className="fp-restaurant-meta">
                    {[formatDate(item.visitDate), formatMoney(item.price)].filter(Boolean).map((text, index) => (
                      <span key={`${text}-${index}`}>{text}</span>
                    ))}
                  </div>
                  {item.memo || item.address ? <em>{item.memo || item.address}</em> : null}
                  {item.location || item.address ? <small>{item.location || item.address}</small> : null}
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
            )) : <p className="fp-empty-text">등록된 맛집이 없습니다.</p>}
          </div>
        </article>
      </div>

      {!showRestaurantFormDialog ? <FloatingActionButton ariaLabel="맛집 추가" onClick={startCreate} /> : null}

      {showRestaurantFormDialog ? (
        <div className="fp-restaurant-form-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) resetForm()
        }}>
        <form className="fp-restaurant-form fp-restaurant-form-dialog fp-card" onSubmit={requestSave}>
          <header>
            <h3>{editing ? '맛집 수정' : '맛집 추가'}</h3>
            <button className="fp-restaurant-close-button" type="button" aria-label="닫기" onClick={resetForm}>
              <HiOutlineX aria-hidden="true" />
            </button>
          </header>

          <div className="fp-restaurant-form-scroll">
          <div className="fp-form-grid">
            <label className="fp-field span-2">
              <span>상호명 <em className="fp-required-mark">*</em></span>
              <input value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} />
            </label>

            <label className="fp-field span-2">
              <span>대표 메뉴</span>
              <input value={form.menu || ''} onChange={(event) => setForm((value) => ({ ...value, menu: event.target.value }))} />
            </label>

            <label className="fp-field">
              <span>금액</span>
              <input
                inputMode="numeric"
                placeholder="예: 15000"
                value={formatNumberInput(form.price)}
                onChange={(event) => setForm((current) => ({ ...current, price: numberOrNull(event.target.value) }))}
              />
            </label>

            <CustomSelect
              label="별점"
              options={ratingOptions}
              value={form.rating == null ? '' : String(form.rating)}
              onChange={(value) => setForm((current) => ({ ...current, rating: numberOrNull(value) }))}
            />

            <DatePickerField
              className="fp-restaurant-date span-2"
              displayValue={formatDate(form.visitDate)}
              label="방문일"
              required
              showCalendarIcon
              value={form.visitDate}
              onChange={(value) => setForm((current) => ({ ...current, visitDate: value }))}
            />

            <label className="fp-field span-2 fp-place-field">
              <span>위치</span>
              <input value={form.location || ''} onChange={(event) => setForm((value) => ({ ...value, location: event.target.value, latitude: null, longitude: null }))} />
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
              <TravelMap point={form.latitude && form.longitude ? { latitude: form.latitude, longitude: form.longitude, label: form.location || form.address || form.name } : null} className="preview" />
            </div>

            <label className="fp-field span-2">
              <span>주소</span>
              <input value={form.address || ''} onChange={(event) => setForm((value) => ({ ...value, address: event.target.value }))} />
            </label>

            <label className="fp-field span-2">
              <span>메모</span>
              <textarea value={form.memo || ''} onChange={(event) => setForm((value) => ({ ...value, memo: event.target.value }))} />
            </label>
          </div>
          </div>

          <div className="fp-restaurant-form-actions fp-dialog-action-footer">
            <button className="fp-button fp-button-muted" type="button" onClick={resetForm}>취소</button>
            <button className="fp-button fp-button-primary" type="submit">{editing ? '저장' : '저장'}</button>
          </div>
        </form>
        </div>
      ) : null}

      {confirmKind ? (
        <ConfirmDialog
          title={confirmKind === 'delete' ? '삭제' : editing ? '수정' : '저장'}
          body={confirmKind === 'delete' ? '맛집을 삭제하시겠습니까?' : editing ? '맛집을 수정하시겠습니까?' : '맛집을 저장하시겠습니까?'}
          confirmLabel={confirmKind === 'delete' ? '삭제' : editing ? '수정' : '저장'}
          cancelLabel="취소"
          danger={confirmKind === 'delete'}
          onCancel={() => {
            setConfirmKind(null)
            setPendingDelete(null)
          }}
          onConfirm={confirmKind === 'delete' ? confirmDelete : confirmSave}
        />
      ) : null}

      <ToastMessage message={toastMessage} onClose={() => setToastMessage('')} />
    </section>
  )
}
