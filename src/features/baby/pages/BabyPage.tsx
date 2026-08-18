import { Dispatch, FormEvent, RefObject, SetStateAction, useEffect, useMemo, useRef, useState } from 'react'
import { HiOutlinePhotograph, HiOutlineX } from 'react-icons/hi'
import { apiActionMessage } from '../../../shared/api/client'
import { mediaThumbnailUrl, uploadMedia } from '../../../shared/api/media'
import { ConfirmDialog, DatePickerField, FloatingActionButton, MediaPreviewDialog, ToastMessage } from '../../../shared/components'
import { BABY_GENDER_OPTIONS, BABY_RECORD_TYPES, COMMON_CODE_GROUPS } from '../../../shared/constants/commonCodes'
import { useCommonCodeOptions, useCommonCodeSelectOptions } from '../../../shared/hooks/useCommonCodeOptions'
import { currentTimeText, todayKey } from '../../../shared/utils/date'
import { createBaby, createBabyRecord, deleteBaby, deleteBabyRecord, listBabies, listBabyRecords, updateBaby, updateBabyRecord } from '../api/baby'
import type { BabyPayload, BabyProfile, BabyRecord, BabyRecordPayload } from '../types'
import './baby-page.css'

type ConfirmKind = 'baby-save' | 'baby-delete' | 'record-save' | 'record-delete' | 'growth-save' | 'growth-delete'
type BabyDetailTab = 'growth' | 'records'
type BabyRecordQueryMode = 'month' | 'period'

interface GrowthFormState {
  recordDate: string
  heightCm: number | null
  weightKg: number | null
}

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
  recordType: BABY_RECORD_TYPES[0],
  recordDate: todayKey(),
  recordTime: currentTimeText(),
  sleepEndTime: null,
  amountMl: null,
  heightCm: null,
  weightKg: null,
  memo: '',
  mediaUrls: [],
})

const emptyGrowth = (): GrowthFormState => ({
  recordDate: todayKey(),
  heightCm: null,
  weightKg: null,
})

function numberOrNull(value: string) {
  const parsed = Number(value.replace(/[^\d.]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function sanitizeDecimal(value: string) {
  const sanitized = value.replace(',', '.').replace(/[^\d.]/g, '')
  const decimalIndex = sanitized.indexOf('.')
  return decimalIndex < 0
    ? sanitized
    : `${sanitized.slice(0, decimalIndex + 1)}${sanitized.slice(decimalIndex + 1).replace(/\./g, '').slice(0, 2)}`
}

function decimalOrNull(value: string) {
  if (!value || value === '.') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function decimalText(value: number | null | undefined) {
  return value == null ? '' : String(value)
}

function sanitizeTime(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

function formatDate(value: string) {
  return value ? value.replace(/-/g, '.') : ''
}

function monthKey(value: string) {
  return value.slice(0, 7)
}

function firstDayOfMonth(value: string) {
  return `${monthKey(value)}-01`
}

function lastDayOfMonth(value: string) {
  const [year, month] = monthKey(value).split('-').map(Number)
  const day = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatMonthLabel(value: string) {
  const [year, month] = monthKey(value).split('-')
  return `${year}년 ${String(Number(month)).padStart(2, '0')}월`
}

function growthText(baby: BabyProfile) {
  return [baby.latestHeightCm ? `${baby.latestHeightCm}cm` : '', baby.latestWeightKg ? `${baby.latestWeightKg}kg` : ''].filter(Boolean).join(' · ') || '성장 기록 없음'
}

function recordMetrics(record: BabyRecord) {
  const amountConfig = recordAmountConfig(record.recordType)
  return [
    record.amountMl && amountConfig ? `${record.amountMl}${amountConfig.unit}` : '',
    record.heightCm ? `${record.heightCm}cm` : '',
    record.weightKg ? `${record.weightKg}kg` : '',
  ].filter(Boolean).join(' · ')
}

function recordAmountConfig(recordType: string) {
  if (recordType === '수유') return { label: '수유량(ml)', unit: 'ml' }
  return null
}

function sleepTimeRange(record: Pick<BabyRecord, 'recordTime' | 'sleepEndTime'>) {
  if (!record.recordTime) return ''
  return record.sleepEndTime ? `${record.recordTime.slice(0, 5)} ~ ${record.sleepEndTime.slice(0, 5)}` : record.recordTime.slice(0, 5)
}

function scrollAndFocus(ref: RefObject<HTMLElement | null>) {
  window.setTimeout(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const focusTarget = ref.current?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, .custom-select-trigger, .date-picker-trigger, [tabindex]:not([tabindex="-1"])')
    focusTarget?.focus()
  }, 80)
}

function upsertBaby(list: BabyProfile[], baby: BabyProfile) {
  return list.some((item) => item.id === baby.id)
    ? list.map((item) => (item.id === baby.id ? baby : item))
    : [baby, ...list]
}

function upsertRecord(list: BabyRecord[], record: BabyRecord) {
  return list.some((item) => item.id === record.id)
    ? list.map((item) => (item.id === record.id ? record : item))
    : [record, ...list]
}

function resolveSavedBaby(response: BabyProfile, payload: BabyPayload, fallback?: BabyProfile | null): BabyProfile {
  if (response && typeof response.id === 'number' && typeof response.name === 'string') return response
  return {
    id: fallback?.id ?? Date.now(),
    familyId: fallback?.familyId ?? 0,
    name: payload.name,
    gender: payload.gender,
    birthDate: payload.birthDate,
    memo: payload.memo ?? null,
    photoUrl: payload.photoUrl ?? null,
    initialHeightCm: payload.latestHeightCm ?? null,
    initialWeightKg: payload.latestWeightKg ?? null,
    latestHeightCm: payload.latestHeightCm ?? null,
    latestWeightKg: payload.latestWeightKg ?? null,
    createdAt: fallback?.createdAt ?? new Date().toISOString(),
  }
}

function resolveSavedRecord(response: BabyRecord, babyId: number, payload: BabyRecordPayload, fallback?: BabyRecord | null): BabyRecord {
  if (response && typeof response.id === 'number' && typeof response.recordType === 'string') return response
  return {
    id: fallback?.id ?? Date.now(),
    babyId,
    recordType: payload.recordType,
    recordDate: payload.recordDate,
    recordTime: payload.recordTime ?? null,
    sleepEndTime: payload.sleepEndTime ?? null,
    amountMl: payload.amountMl ?? null,
    heightCm: payload.heightCm ?? null,
    weightKg: payload.weightKg ?? null,
    memo: payload.memo ?? null,
    mediaUrls: payload.mediaUrls ?? [],
    createdAt: fallback?.createdAt ?? new Date().toISOString(),
  }
}

export default function BabyPage() {
  const recordTypes = useCommonCodeOptions(COMMON_CODE_GROUPS.babyRecordTypes, BABY_RECORD_TYPES)
  const recordTypeOptions = useMemo(() => recordTypes.map((type) => ({ label: type, value: type })), [recordTypes])
  const genderOptions = useCommonCodeSelectOptions(COMMON_CODE_GROUPS.babyGenders, BABY_GENDER_OPTIONS)
  const [babies, setBabies] = useState<BabyProfile[]>([])
  const [selectedBaby, setSelectedBaby] = useState<BabyProfile | null>(null)
  const [records, setRecords] = useState<BabyRecord[]>([])
  const [babyForm, setBabyForm] = useState<BabyPayload>(() => emptyBaby())
  const [recordForm, setRecordForm] = useState<BabyRecordPayload>(() => emptyRecord())
  const [growthForm, setGrowthForm] = useState<GrowthFormState>(() => emptyGrowth())
  const [editingBaby, setEditingBaby] = useState<BabyProfile | null>(null)
  const [editingRecord, setEditingRecord] = useState<BabyRecord | null>(null)
  const [editingGrowthRecord, setEditingGrowthRecord] = useState<BabyRecord | null>(null)
  const [pendingBabyDelete, setPendingBabyDelete] = useState<BabyProfile | null>(null)
  const [pendingRecordDelete, setPendingRecordDelete] = useState<BabyRecord | null>(null)
  const [pendingGrowthDelete, setPendingGrowthDelete] = useState<BabyRecord | null>(null)
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null)
  const [detailTab, setDetailTab] = useState<BabyDetailTab>('growth')
  const [recordQueryMode, setRecordQueryMode] = useState<BabyRecordQueryMode>('month')
  const [recordMonth, setRecordMonth] = useState(() => monthKey(todayKey()))
  const [recordPeriodStart, setRecordPeriodStart] = useState(() => firstDayOfMonth(todayKey()))
  const [recordPeriodEnd, setRecordPeriodEnd] = useState(() => lastDayOfMonth(todayKey()))
  const [showGrowthHistory, setShowGrowthHistory] = useState(false)
  const [showBabyFormDialog, setShowBabyFormDialog] = useState(false)
  const [showRecordFormDialog, setShowRecordFormDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [mediaPreview, setMediaPreview] = useState<{ file?: File; url?: string; title: string } | null>(null)
  const [babyHeightText, setBabyHeightText] = useState('')
  const [babyWeightText, setBabyWeightText] = useState('')
  const [babyPhotoFile, setBabyPhotoFile] = useState<File | null>(null)
  const babyFormRef = useRef<HTMLFormElement>(null)
  const recordFormRef = useRef<HTMLFormElement>(null)
  const growthFormRef = useRef<HTMLFormElement>(null)

  const sortedBabies = useMemo(() => [...babies].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [babies])
  const sortedRecords = useMemo(() => [...records].sort((a, b) => `${b.recordDate} ${b.createdAt}`.localeCompare(`${a.recordDate} ${a.createdAt}`)), [records])
  const growthRecords = useMemo(() => sortedRecords.filter((record) => record.heightCm || record.weightKg), [sortedRecords])
  const normalRecords = useMemo(() => sortedRecords.filter((record) => record.recordType !== '성장'), [sortedRecords])
  const recordQueryRange = useMemo(() => {
    if (recordQueryMode === 'month') {
      return { start: firstDayOfMonth(recordMonth), end: lastDayOfMonth(recordMonth) }
    }
    const start = recordPeriodStart <= recordPeriodEnd ? recordPeriodStart : recordPeriodEnd
    const end = recordPeriodStart <= recordPeriodEnd ? recordPeriodEnd : recordPeriodStart
    return { start, end }
  }, [recordMonth, recordPeriodEnd, recordPeriodStart, recordQueryMode])
  const filteredNormalRecords = useMemo(() => (
    normalRecords.filter((record) => record.recordDate >= recordQueryRange.start && record.recordDate <= recordQueryRange.end)
  ), [normalRecords, recordQueryRange])
  const recordQueryLabel = recordQueryMode === 'month'
    ? formatMonthLabel(recordMonth)
    : `${formatDate(recordQueryRange.start)} ~ ${formatDate(recordQueryRange.end)}`
  const patternCounts = useMemo(() => {
    return recordTypes.map((type) => ({ type, count: filteredNormalRecords.filter((record) => record.recordType === type).length }))
  }, [filteredNormalRecords, recordTypes])

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

  async function refreshBabyProfiles(selectedBabyID?: number) {
    const nextBabies = await listBabies()
    setBabies(nextBabies)
    if (selectedBabyID) {
      const refreshedBaby = nextBabies.find((baby) => baby.id === selectedBabyID)
      if (refreshedBaby) setSelectedBaby(refreshedBaby)
    }
    return nextBabies
  }

  async function reloadRecords(baby: BabyProfile) {
    setLoading(true)
    setMessage('')
    try {
      setRecords(await listBabyRecords(baby.id))
      setEditingRecord(null)
      setEditingGrowthRecord(null)
      setRecordForm((value) => (value.memo || value.amountMl ? value : emptyRecord()))
      setGrowthForm((value) => (value.heightCm || value.weightKg ? value : emptyGrowth()))
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

  function openDetail(baby: BabyProfile) {
    setSelectedBaby(baby)
    setEditingBaby(null)
    setDetailTab('growth')
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0)
  }

  function startBabyEdit(baby: BabyProfile) {
    setEditingBaby(baby)
    setBabyForm({
      name: baby.name,
      gender: baby.gender || null,
      birthDate: baby.birthDate,
      memo: baby.memo || '',
      photoUrl: baby.photoUrl || null,
      latestHeightCm: baby.initialHeightCm ?? baby.latestHeightCm ?? null,
      latestWeightKg: baby.initialWeightKg ?? baby.latestWeightKg ?? null,
    })
    setBabyHeightText(decimalText(baby.initialHeightCm ?? baby.latestHeightCm))
    setBabyWeightText(decimalText(baby.initialWeightKg ?? baby.latestWeightKg))
    setBabyPhotoFile(null)
    setShowBabyFormDialog(true)
    scrollAndFocus(babyFormRef)
  }

  function startBabyCreate() {
    setEditingBaby(null)
    setBabyForm(emptyBaby())
    setBabyHeightText('')
    setBabyWeightText('')
    setBabyPhotoFile(null)
    setShowBabyFormDialog(true)
    scrollAndFocus(babyFormRef)
  }

  function resetBabyForm() {
    setEditingBaby(null)
    setBabyForm(emptyBaby())
    setBabyHeightText('')
    setBabyWeightText('')
    setBabyPhotoFile(null)
    setShowBabyFormDialog(false)
  }

  function requestBabySave(event: FormEvent) {
    event.preventDefault()
    if (!babyForm.name.trim()) {
      setMessage('이름은 필수입니다.')
      window.setTimeout(() => babyFormRef.current?.querySelector<HTMLInputElement>('input[name="baby-name"]')?.focus(), 0)
      return
    }
    if (!babyForm.gender) {
      setMessage('성별은 필수입니다.')
      window.setTimeout(() => babyFormRef.current?.querySelector<HTMLButtonElement>('.baby-custom-select .custom-select-trigger')?.focus(), 0)
      return
    }
    if (!babyForm.birthDate) {
      setMessage('생일은 필수입니다.')
      window.setTimeout(() => babyFormRef.current?.querySelector<HTMLButtonElement>('.baby-create-date-field .date-picker-trigger')?.focus(), 0)
      return
    }
    setConfirmKind('baby-save')
  }

  async function confirmBabySave() {
    setLoading(true)
    setMessage('')
    const wasEditing = Boolean(editingBaby)
    try {
      const uploadedPhoto = babyPhotoFile ? await uploadMedia(babyPhotoFile) : null
      const payload = {
        ...babyForm,
        name: babyForm.name.trim(),
        memo: babyForm.memo?.trim() || null,
        photoUrl: uploadedPhoto?.url ?? babyForm.photoUrl ?? null,
      }
      const saved = resolveSavedBaby(editingBaby ? await updateBaby(editingBaby.id, payload) : await createBaby(payload), payload, editingBaby)
      setBabies((current) => upsertBaby(current, saved))
      resetBabyForm()
      if (selectedBaby?.id === saved.id) setSelectedBaby(saved)
      setMessage(wasEditing ? '아이 정보를 수정했습니다.' : '아이를 추가했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, wasEditing ? '아이 정보 수정에 실패했습니다.' : '아이 추가에 실패했습니다.'))
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
      setBabies((current) => current.filter((baby) => baby.id !== pendingBabyDelete.id))
      if (selectedBaby?.id === pendingBabyDelete.id) setSelectedBaby(null)
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
    setDetailTab('records')
    setEditingRecord(record)
    setRecordForm({
      recordType: record.recordType,
      recordDate: record.recordDate,
      recordTime: record.recordTime?.slice(0, 5) || currentTimeText(),
      sleepEndTime: record.sleepEndTime?.slice(0, 5) || null,
      amountMl: record.amountMl || null,
      heightCm: null,
      weightKg: null,
      memo: record.memo || '',
      mediaUrls: record.mediaUrls || [],
    })
    setShowRecordFormDialog(true)
    scrollAndFocus(recordFormRef)
  }

  function startRecordCreate() {
    setEditingRecord(null)
    setRecordForm(emptyRecord())
    setShowRecordFormDialog(true)
    scrollAndFocus(recordFormRef)
  }

  function resetRecordForm() {
    setEditingRecord(null)
    setRecordForm(emptyRecord())
    setShowRecordFormDialog(false)
  }

  function startGrowthEdit(record: BabyRecord) {
    setDetailTab('growth')
    setEditingGrowthRecord(record)
    setGrowthForm({
      recordDate: record.recordDate,
      heightCm: record.heightCm || null,
      weightKg: record.weightKg || null,
    })
    setShowGrowthHistory(false)
    scrollAndFocus(growthFormRef)
  }

  function requestGrowthSave(event: FormEvent) {
    event.preventDefault()
    if (!selectedBaby) return
    if (!growthForm.recordDate || (!growthForm.heightCm && !growthForm.weightKg)) {
      setMessage('날짜와 키 또는 몸무게를 입력해주세요.')
      return
    }
    setConfirmKind('growth-save')
  }

  async function confirmGrowthSave() {
    if (!selectedBaby) return
    setLoading(true)
    setMessage('')
    const wasEditing = Boolean(editingGrowthRecord)
    try {
      const payload: BabyRecordPayload = {
        recordType: '성장',
        recordDate: growthForm.recordDate,
        recordTime: currentTimeText(),
        sleepEndTime: null,
        amountMl: null,
        heightCm: growthForm.heightCm,
        weightKg: growthForm.weightKg,
        memo: null,
        mediaUrls: [],
      }
      const saved = resolveSavedRecord(
        editingGrowthRecord ? await updateBabyRecord(editingGrowthRecord.id, payload) : await createBabyRecord(selectedBaby.id, payload),
        selectedBaby.id,
        payload,
        editingGrowthRecord,
      )
      setRecords((current) => upsertRecord(current, saved))
      await refreshBabyProfiles(selectedBaby.id)
      setGrowthForm(emptyGrowth())
      setEditingGrowthRecord(null)
      setMessage(wasEditing ? '성장 기록을 수정했습니다.' : '성장 기록을 저장했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, wasEditing ? '성장 기록 수정에 실패했습니다.' : '성장 기록 저장에 실패했습니다.'))
    } finally {
      setConfirmKind(null)
      setLoading(false)
    }
  }

  async function confirmGrowthDelete() {
    if (!selectedBaby || !pendingGrowthDelete) return
    setLoading(true)
    setMessage('')
    try {
      await deleteBabyRecord(pendingGrowthDelete.id)
      setRecords((current) => current.filter((record) => record.id !== pendingGrowthDelete.id))
      await refreshBabyProfiles(selectedBaby.id)
      setMessage('성장 기록을 삭제했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, '성장 기록 삭제에 실패했습니다.'))
    } finally {
      setPendingGrowthDelete(null)
      setConfirmKind(null)
      setLoading(false)
    }
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
    const wasEditing = Boolean(editingRecord)
    try {
      const payload = {
        ...recordForm,
        heightCm: null,
        weightKg: null,
        memo: recordForm.memo?.trim() || null,
        recordTime: recordForm.recordTime?.slice(0, 5) || currentTimeText(),
      }
      const saved = resolveSavedRecord(
        editingRecord ? await updateBabyRecord(editingRecord.id, payload) : await createBabyRecord(selectedBaby.id, payload),
        selectedBaby.id,
        payload,
        editingRecord,
      )
      setRecords((current) => upsertRecord(current, saved))
      resetRecordForm()
      setMessage(wasEditing ? '육아 기록을 수정했습니다.' : '육아 기록을 추가했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, wasEditing ? '육아 기록 수정에 실패했습니다.' : '육아 기록 추가에 실패했습니다.'))
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
      setRecords((current) => current.filter((record) => record.id !== pendingRecordDelete.id))
      setMessage('육아 기록을 삭제했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, '육아 기록 삭제에 실패했습니다.'))
    } finally {
      setPendingRecordDelete(null)
      setConfirmKind(null)
      setLoading(false)
    }
  }

  const isEditConfirm =
    confirmKind === 'baby-save' ? Boolean(editingBaby)
      : confirmKind === 'record-save' ? Boolean(editingRecord)
        : confirmKind === 'growth-save' ? Boolean(editingGrowthRecord)
          : false

  const confirmConfig = confirmKind
    ? {
      title: confirmKind.includes('delete') ? '삭제' : isEditConfirm ? '수정' : '저장',
      body: confirmKind.includes('delete') ? '삭제하시겠습니까?' : isEditConfirm ? '수정하시겠습니까?' : '저장하시겠습니까?',
      label: confirmKind.includes('delete') ? '삭제' : isEditConfirm ? '수정' : '저장',
    }
    : null

  return (
    <section className="fp-card fp-baby">
      {loading ? <div className="fp-loading-blocker">처리 중</div> : null}
      <header className="fp-baby-header baby-api-detail-header">
        <div>
          <h2>육아 기록</h2>
        </div>
        {selectedBaby ? (
          <button className="fp-button fp-button-muted back-button" type="button" onClick={() => setSelectedBaby(null)}>목록</button>
        ) : (
          <button className="fp-button fp-button-primary baby-add-button" type="button" onClick={startBabyCreate}>입력</button>
        )}
      </header>
      <ToastMessage message={message} onClose={() => setMessage('')} />

      {!selectedBaby ? (
        <div className="fp-baby-layout">
          <section className="fp-baby-list baby-list-grid" aria-label="아이 목록">
            {sortedBabies.length ? sortedBabies.map((baby) => (
              <article className="fp-baby-card baby-card" key={baby.id}>
                {baby.photoUrl ? (
                  <button className="baby-card-photo-preview" type="button" aria-label={`${baby.name} 사진 보기`} onClick={() => setMediaPreview({ url: baby.photoUrl || '', title: `${baby.name} 사진` })}>
                    <img className="baby-card-avatar baby-avatar baby-photo" src={mediaThumbnailUrl(baby.photoUrl)} alt={`${baby.name} 메인 사진`} loading="lazy" decoding="async" />
                  </button>
                ) : <span className="baby-card-avatar baby-avatar">아이</span>}
                <button type="button" onClick={() => openDetail(baby)}>
                  <span className="baby-card-title-row">
                    <strong className="fp-ellipsis" title={baby.name}>{baby.name}</strong>
                    <small>{growthText(baby)}</small>
                  </span>
                  <span>{[baby.gender || '', baby.birthDate].filter(Boolean).join(' · ')}</span>
                  {baby.memo ? <p>{baby.memo}</p> : null}
                </button>
                <span className="baby-card-actions">
                  <button className="baby-card-edit-button edit-button" type="button" onClick={() => startBabyEdit(baby)}>수정</button>
                  <button
                    type="button"
                    className="danger-button baby-card-delete-button"
                    onClick={() => {
                      setPendingBabyDelete(baby)
                      setConfirmKind('baby-delete')
                    }}
                  >
                    삭제
                  </button>
                </span>
              </article>
            )) : <p className="fp-empty-text api-empty-row">등록된 아이가 없습니다.</p>}
          </section>
        </div>
      ) : (
        <section className="baby-detail baby-api-detail">
          <div className={`baby-api-detail-layout fp-baby-detail-layout ${detailTab === 'growth' ? 'growth-mode' : 'records-mode'}`}>
            <div className="baby-api-detail-main fp-baby-detail-main">
              <article className="baby-profile-band fp-baby-profile">
                {selectedBaby.photoUrl ? (
                  <button className="baby-detail-photo-preview" type="button" aria-label={`${selectedBaby.name} 사진 보기`} onClick={() => setMediaPreview({ url: selectedBaby.photoUrl || '', title: `${selectedBaby.name} 사진` })}>
                    <img className="baby-avatar large baby-photo" src={mediaThumbnailUrl(selectedBaby.photoUrl)} alt={`${selectedBaby.name} 메인 사진`} decoding="async" />
                  </button>
                ) : <span className="baby-avatar large">아이</span>}
                <div>
                  <strong className="fp-ellipsis" title={selectedBaby.name}>{selectedBaby.name}</strong>
                  <span>{[selectedBaby.gender || '', selectedBaby.birthDate].filter(Boolean).join(' · ')}</span>
                  {selectedBaby.memo ? <p>{selectedBaby.memo}</p> : null}
                  <small>{growthText(selectedBaby)}</small>
                </div>
              </article>
              <div className="baby-detail-tabs" role="tablist" aria-label="육아 기록 분류">
                <button type="button" className={detailTab === 'growth' ? 'active' : ''} aria-pressed={detailTab === 'growth'} onClick={() => setDetailTab('growth')}>성장기록</button>
                <button type="button" className={detailTab === 'records' ? 'active' : ''} aria-pressed={detailTab === 'records'} onClick={() => setDetailTab('records')}>기록</button>
              </div>
              {detailTab === 'growth' ? (
                <section className="baby-detail-tab-panel baby-growth-tab-panel" role="tabpanel" aria-label="성장기록">
                  <section className="baby-growth-api-panel">
                    <header>
                      <h3>성장 기록</h3>
                      <button className="secondary-action baby-growth-history-button" type="button" onClick={() => setShowGrowthHistory(true)}>과거성장기록</button>
                    </header>
                    <GrowthForm
                      formRef={growthFormRef}
                      form={growthForm}
                      editing={Boolean(editingGrowthRecord)}
                      setForm={setGrowthForm}
                      onSubmit={requestGrowthSave}
                      onReset={() => {
                        setEditingGrowthRecord(null)
                        setGrowthForm(emptyGrowth())
                      }}
                    />
                    <GrowthChart records={growthRecords} />
                    <div className="baby-growth-api-history">
                      {growthRecords.length ? growthRecords.slice(0, 4).map((record, index) => (
                        <article className="baby-growth-history-row" key={record.id}>
                          <strong>{index + 1}. {formatDate(record.recordDate)}</strong>
                          <span>{[record.heightCm ? `${record.heightCm}cm` : '', record.weightKg ? `${record.weightKg}kg` : ''].filter(Boolean).join(' · ')}</span>
                        </article>
                      )) : <p className="fp-empty-text api-empty-row">성장 기록이 없습니다.</p>}
                    </div>
                  </section>
                </section>
              ) : (
                <section className="baby-detail-tab-panel baby-record-tab-panel" role="tabpanel" aria-label="기록">
                  <section className="baby-record-query-panel">
                    <header>
                      <h3>기록 조회</h3>
                      <span>{recordQueryLabel}</span>
                    </header>
                    <div className={`baby-record-query-row ${recordQueryMode === 'period' ? 'period-mode' : 'month-mode'}`}>
                      <div className="baby-record-query-tabs" role="tablist" aria-label="기록 조회 방식">
                        <button className={recordQueryMode === 'month' ? 'active' : ''} type="button" onClick={() => setRecordQueryMode('month')}>월별</button>
                        <button className={recordQueryMode === 'period' ? 'active' : ''} type="button" onClick={() => setRecordQueryMode('period')}>기간별</button>
                      </div>
                      {recordQueryMode === 'month' ? (
                        <DatePickerField
                          className="baby-record-month-picker"
                          displayValue={formatMonthLabel(recordMonth)}
                          label="조회 월"
                          mode="month"
                          showCalendarIcon
                          value={recordMonth}
                          onChange={setRecordMonth}
                        />
                      ) : (
                        <div className="baby-record-period-fields">
                          <DatePickerField label="시작일" showCalendarIcon value={recordPeriodStart} onChange={setRecordPeriodStart} />
                          <DatePickerField label="종료일" showCalendarIcon value={recordPeriodEnd} onChange={setRecordPeriodEnd} />
                        </div>
                      )}
                    </div>
                  </section>
                  <section className="baby-pattern-api-panel">
                    <header>
                      <h3>생활 패턴</h3>
                      <span>{recordQueryLabel}</span>
                    </header>
                    <div className="baby-pattern-api-summary">
                      <div className="pattern-grid">
                        {patternCounts.map((item) => (
                          <article key={item.type}>
                            <strong>{item.type}</strong>
                            <span>{item.count}건</span>
                          </article>
                        ))}
                      </div>
                    </div>
                  </section>
                  <section className="baby-record-list">
                    <header className="baby-record-list-header">
                      <h3>기록</h3>
                      <button className="fp-button fp-button-primary" type="button" onClick={startRecordCreate}>입력</button>
                    </header>
                    {filteredNormalRecords.length ? filteredNormalRecords.map((record) => (
                      <article className="baby-record-row api-baby-record-row" key={record.id}>
                        <b>{record.recordType}</b>
                        <div>
                          <strong>{record.recordType}</strong>
                          <span>{[formatDate(record.recordDate), record.recordType === '수면' ? sleepTimeRange(record) : record.recordTime?.slice(0, 5), recordMetrics(record)].filter(Boolean).join(' · ')}</span>
                          {record.memo ? <p>{record.memo}</p> : null}
                        </div>
                        <div className="record-row-actions">
                          <button className="edit-button" type="button" onClick={() => startRecordEdit(record)}>수정</button>
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => {
                              setPendingRecordDelete(record)
                              setConfirmKind('record-delete')
                            }}
                          >
                            삭제
                          </button>
                        </div>
                      </article>
                    )) : <p className="fp-empty-text api-empty-row">해당 기간의 육아 기록이 없습니다.</p>}
                  </section>
                </section>
              )}
            </div>
          </div>
        </section>
      )}

      {!showBabyFormDialog && !showRecordFormDialog ? (
        <FloatingActionButton
          ariaLabel={selectedBaby ? '육아 기록 추가' : '아이 추가'}
          onClick={selectedBaby ? startRecordCreate : startBabyCreate}
        />
      ) : null}

      {showBabyFormDialog ? (
        <div className="baby-profile-edit-backdrop baby-form-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) resetBabyForm()
        }}>
          <section className="baby-profile-edit-dialog baby-form-dialog" role="dialog" aria-modal="true" aria-label={editingBaby ? '아이 정보 수정' : '아이 추가'}>
            <BabyForm
              formRef={babyFormRef}
              form={babyForm}
              editing={Boolean(editingBaby)}
              genderOptions={genderOptions}
              heightText={babyHeightText}
              weightText={babyWeightText}
              photoFile={babyPhotoFile}
              onSubmit={requestBabySave}
              onReset={resetBabyForm}
              onHeightChange={(nextValue) => {
                const value = sanitizeDecimal(nextValue)
                setBabyHeightText(value)
                setBabyForm((current) => ({ ...current, latestHeightCm: decimalOrNull(value) }))
              }}
              onWeightChange={(nextValue) => {
                const value = sanitizeDecimal(nextValue)
                setBabyWeightText(value)
                setBabyForm((current) => ({ ...current, latestWeightKg: decimalOrNull(value) }))
              }}
              onPhotoFileChange={setBabyPhotoFile}
              onPreviewFile={(file) => setMediaPreview({ file, title: file.name })}
              setForm={setBabyForm}
            />
          </section>
        </div>
      ) : null}

      {showRecordFormDialog ? (
        <div className="baby-profile-edit-backdrop baby-record-form-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) resetRecordForm()
        }}>
          <section className="baby-profile-edit-dialog baby-form-dialog baby-record-form-dialog" role="dialog" aria-modal="true" aria-label={editingRecord ? '육아 기록 수정' : '육아 기록 추가'}>
            <RecordForm
              formRef={recordFormRef}
              form={recordForm}
              editing={Boolean(editingRecord)}
              recordTypeOptions={recordTypeOptions}
              setForm={setRecordForm}
              onSubmit={requestRecordSave}
              onReset={resetRecordForm}
            />
          </section>
        </div>
      ) : null}

      {showGrowthHistory ? (
        <div className="baby-profile-edit-backdrop baby-growth-history-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowGrowthHistory(false)
        }}>
          <section className="baby-profile-edit-dialog baby-growth-history-dialog" role="dialog" aria-modal="true" aria-label="과거성장기록">
            <header>
              <div>
                <h2>과거성장기록</h2>
                <p>{selectedBaby?.name} 성장 기록</p>
              </div>
              <button className="modal-close" type="button" aria-label="닫기" onClick={() => setShowGrowthHistory(false)}>
                <HiOutlineX aria-hidden="true" />
              </button>
            </header>
            <div className="baby-growth-history-dialog-list">
              {growthRecords.length ? growthRecords.map((record) => (
                <article className="baby-growth-history-dialog-row" key={record.id}>
                  <div>
                    <strong>{[formatDate(record.recordDate), record.recordTime?.slice(0, 5)].filter(Boolean).join(' · ')}</strong>
                    <span>{[record.heightCm ? `${record.heightCm}cm` : '', record.weightKg ? `${record.weightKg}kg` : ''].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="baby-growth-history-dialog-actions">
                    <button className="edit-button" type="button" onClick={() => startGrowthEdit(record)}>수정</button>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() => {
                        setPendingGrowthDelete(record)
                        setConfirmKind('growth-delete')
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </article>
              )) : <p className="fp-empty-text api-empty-row">성장 기록이 없습니다.</p>}
            </div>
          </section>
        </div>
      ) : null}

      {confirmKind && confirmConfig ? (
        <ConfirmDialog
          title={confirmConfig.title}
          body={confirmConfig.body}
          confirmLabel={confirmConfig.label}
          danger={confirmKind.includes('delete')}
          onCancel={() => {
            setConfirmKind(null)
            setPendingBabyDelete(null)
            setPendingRecordDelete(null)
            setPendingGrowthDelete(null)
          }}
          onConfirm={
            confirmKind === 'baby-save' ? confirmBabySave
              : confirmKind === 'baby-delete' ? confirmBabyDelete
                : confirmKind === 'record-save' ? confirmRecordSave
                  : confirmKind === 'record-delete' ? confirmRecordDelete
                    : confirmKind === 'growth-save' ? confirmGrowthSave
                      : confirmGrowthDelete
          }
        />
      ) : null}

      {mediaPreview ? <MediaPreviewDialog {...mediaPreview} onClose={() => setMediaPreview(null)} /> : null}
    </section>
  )
}

type GrowthMode = 'height' | 'weight'

function GrowthChart({ records }: { records: BabyRecord[] }) {
  const [mode, setMode] = useState<GrowthMode>('height')
  const heightRecords = records.filter((record) => record.heightCm)
  const weightRecords = records.filter((record) => record.weightKg)
  const activeMode = mode === 'weight' && weightRecords.length ? 'weight' : heightRecords.length ? 'height' : 'weight'
  const selectedRecords = (activeMode === 'weight' ? weightRecords : heightRecords).slice().reverse()
  const selectedPoints = selectedRecords
    .map((record, index) => ({
      index,
      label: String(record.recordDate || '').slice(5).replace('-', '.'),
      value: activeMode === 'weight' ? record.weightKg || 0 : record.heightCm || 0,
    }))
    .filter((point) => point.value > 0)

  if (!selectedPoints.length) return null

  const values = selectedPoints.map((point) => point.value)
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    min = Math.max(0, min - 1)
    max += 1
  }

  const width = 720
  const height = 280
  const left = 72
  const right = 26
  const top = 34
  const bottom = 58
  const chartWidth = width - left - right
  const chartHeight = height - top - bottom
  const maxIndex = Math.max(selectedPoints.length - 1, 1)
  const xy = (point: { index: number; value: number }) => ({
    x: left + chartWidth * (point.index / maxIndex),
    y: top + chartHeight * (1 - ((point.value - min) / (max - min))),
  })
  const linePoints = selectedPoints.map((point) => {
    const pos = xy(point)
    return `${pos.x.toFixed(1)},${pos.y.toFixed(1)}`
  }).join(' ')
  const labels = [0, 0.5, 1].map((rate) => {
    const value = max - ((max - min) * rate)
    const y = top + chartHeight * rate
    return { value, y }
  })
  const xLabels = selectedPoints.filter((_, index) => (
    selectedPoints.length <= 4 || index === 0 || index === selectedPoints.length - 1 || index === Math.floor((selectedPoints.length - 1) / 2)
  ))
  const label = activeMode === 'weight' ? '몸무게' : '키'
  const unit = activeMode === 'weight' ? 'kg' : 'cm'

  return (
    <div className="growth-chart baby-growth-chart">
      <div className="growth-chart-toggle" role="group" aria-label="성장 차트 지표">
        <button type="button" className={activeMode === 'height' ? 'active' : ''} disabled={!heightRecords.length} aria-pressed={activeMode === 'height'} onClick={() => setMode('height')}>키</button>
        <button type="button" className={activeMode === 'weight' ? 'active' : ''} disabled={!weightRecords.length} aria-pressed={activeMode === 'weight'} onClick={() => setMode('weight')}>몸무게</button>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} 성장 차트`}>
        {labels.map((item) => (
          <g key={item.y}>
            <line className="grid-line" x1={left} x2={width - right} y1={item.y.toFixed(1)} y2={item.y.toFixed(1)} />
            <text className="axis-label" x={left - 10} y={(item.y + 7).toFixed(1)}>{item.value.toFixed(1)}</text>
          </g>
        ))}
        <line className="axis-line" x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} />
        <polyline className={activeMode === 'weight' ? 'weight-line' : 'height-line'} points={linePoints} />
        {selectedPoints.map((point) => {
          const pos = xy(point)
          return <circle className={activeMode === 'weight' ? 'weight-dot' : 'height-dot'} key={`${point.label}-${point.value}-${point.index}`} cx={pos.x.toFixed(1)} cy={pos.y.toFixed(1)} r="5"><title>{`${point.label} ${point.value}`}</title></circle>
        })}
        {xLabels.map((point) => {
          const x = left + chartWidth * (point.index / maxIndex)
          return <text className="x-label" key={`${point.label}-${point.index}`} x={x.toFixed(1)} y={height - 14}>{point.label}</text>
        })}
        <text className="unit-label" x={left} y="22">{unit}</text>
      </svg>
    </div>
  )
}

function BabyForm({ formRef, form, editing, genderOptions, heightText, weightText, photoFile, setForm, onSubmit, onReset, onHeightChange, onWeightChange, onPhotoFileChange, onPreviewFile }: {
  formRef: RefObject<HTMLFormElement | null>
  form: BabyPayload
  editing: boolean
  genderOptions: readonly { label: string; value: string }[]
  heightText: string
  weightText: string
  photoFile: File | null
  setForm: Dispatch<SetStateAction<BabyPayload>>
  onSubmit: (event: FormEvent) => void
  onReset: () => void
  onHeightChange: (value: string) => void
  onWeightChange: (value: string) => void
  onPhotoFileChange: (file: File | null) => void
  onPreviewFile: (file: File) => void
}) {
  const photoInputRef = useRef<HTMLInputElement>(null)

  return (
    <form className="fp-baby-form baby-form" ref={formRef} onSubmit={onSubmit}>
      <header>
        <h3>{editing ? '아이 정보 수정' : '아이 추가'}</h3>
        <button className="modal-close" type="button" onClick={onReset} aria-label="닫기">
          <HiOutlineX aria-hidden="true" />
        </button>
      </header>
      <div className="fp-form-grid baby-profile-form">
        <label className="fp-field form-field">
          <span className="form-label">이름 <em className="fp-required-mark">*</em></span>
          <input className="form-control" name="baby-name" value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} />
        </label>
        <BabyCustomSelect
          label="성별"
          required
          value={form.gender || ''}
          options={genderOptions}
          onChange={(value) => setForm((current) => ({ ...current, gender: value || null }))}
        />
        <DatePickerField
          className="baby-create-date-field"
          label="생일"
          required
          value={form.birthDate}
          onChange={(value) => setForm((current) => ({ ...current, birthDate: value }))}
        />
        <label className="fp-field form-field">
          <span className="form-label">키(cm)</span>
          <input className="form-control" inputMode="decimal" value={heightText} onChange={(event) => onHeightChange(event.target.value)} />
        </label>
        <label className="fp-field form-field">
          <span className="form-label">몸무게(kg)</span>
          <input className="form-control" inputMode="decimal" value={weightText} onChange={(event) => onWeightChange(event.target.value)} />
        </label>
        <div className="fp-field form-field span-2 fp-baby-photo-field">
          <span className="form-label">메인 사진</span>
          <input ref={photoInputRef} className="photo-input" type="file" accept="image/*" onChange={(event) => {
            const file = event.target.files?.[0] || null
            onPhotoFileChange(file)
            if (file) onPreviewFile(file)
            event.target.value = ''
          }} />
          <div className="baby-photo-picker">
            <button type="button" onClick={() => photoInputRef.current?.click()}><HiOutlinePhotograph aria-hidden="true" /> 사진 선택</button>
            <span className="fp-ellipsis">{photoFile ? photoFile.name : form.photoUrl ? '등록된 사진' : '선택된 사진 없음'}</span>
          </div>
          <small>{photoFile ? photoFile.name : form.photoUrl ? '등록된 사진을 변경할 수 있습니다.' : '이미지 파일을 선택해주세요.'}</small>
        </div>
        <label className="fp-field form-field span-2">
          <span className="form-label">메모</span>
          <textarea className="form-control" value={form.memo || ''} onChange={(event) => setForm((value) => ({ ...value, memo: event.target.value }))} />
        </label>
      </div>
      <div className="fp-dialog-action-footer">
        <button className="fp-button fp-button-muted" type="button" onClick={onReset}>취소</button>
        <button className="fp-button fp-button-primary save-button" type="submit">저장</button>
      </div>
    </form>
  )
}

function GrowthForm({ formRef, form, editing, setForm, onSubmit, onReset }: {
  formRef: RefObject<HTMLFormElement | null>
  form: GrowthFormState
  editing: boolean
  setForm: Dispatch<SetStateAction<GrowthFormState>>
  onSubmit: (event: FormEvent) => void
  onReset: () => void
}) {
  const [heightText, setHeightText] = useState(() => decimalText(form.heightCm))
  const [weightText, setWeightText] = useState(() => decimalText(form.weightKg))

  useEffect(() => {
    setHeightText(decimalText(form.heightCm))
  }, [form.heightCm])

  useEffect(() => {
    setWeightText(decimalText(form.weightKg))
  }, [form.weightKg])

  return (
    <form className="baby-growth-api-form" ref={formRef} onSubmit={onSubmit}>
      <DatePickerField
        className="baby-growth-date-field"
        label="날짜"
        required
        value={form.recordDate}
        onChange={(value) => setForm((current) => ({ ...current, recordDate: value }))}
      />
      <label className="form-field">
        <span className="form-label">키(cm)</span>
        <input
          className="form-control"
          inputMode="decimal"
          value={heightText}
          onChange={(event) => {
            const value = sanitizeDecimal(event.target.value)
            setHeightText(value)
            setForm((current) => ({ ...current, heightCm: decimalOrNull(value) }))
          }}
        />
      </label>
      <label className="form-field">
        <span className="form-label">몸무게(kg)</span>
        <input
          className="form-control"
          inputMode="decimal"
          value={weightText}
          onChange={(event) => {
            const value = sanitizeDecimal(event.target.value)
            setWeightText(value)
            setForm((current) => ({ ...current, weightKg: decimalOrNull(value) }))
          }}
        />
      </label>
      <button className="save-button" type="submit">{editing ? '수정' : '저장'}</button>
      {editing ? <button className="cancel-button" type="button" onClick={onReset}>취소</button> : null}
    </form>
  )
}

function RecordForm({ formRef, form, editing, recordTypeOptions, setForm, onSubmit, onReset }: {
  formRef: RefObject<HTMLFormElement | null>
  form: BabyRecordPayload
  editing: boolean
  recordTypeOptions: readonly { label: string; value: string }[]
  setForm: Dispatch<SetStateAction<BabyRecordPayload>>
  onSubmit: (event: FormEvent) => void
  onReset: () => void
}) {
  const amountConfig = recordAmountConfig(form.recordType)
  return (
    <form className="fp-baby-form baby-api-record-card baby-api-record-form" ref={formRef} onSubmit={onSubmit}>
      <header>
        <div>
          <span>{editing ? '선택한 기록' : '새 기록'}</span>
          <strong>{editing ? '기록 수정' : '기록 추가'}</strong>
          <small>수유, 배변, 병원 기록</small>
        </div>
        <button className="modal-close" type="button" aria-label="닫기" onClick={onReset}>
          <HiOutlineX aria-hidden="true" />
        </button>
      </header>
      <div className="baby-api-form-grid">
        <BabyCustomSelect
          label="기록종류"
          value={form.recordType}
          options={recordTypeOptions}
          onChange={(value) => setForm((current) => ({
            ...current,
            recordType: value,
            amountMl: value === current.recordType ? current.amountMl : null,
            sleepEndTime: value === '수면' ? current.sleepEndTime : null,
          }))}
        />
        <DatePickerField
          className="baby-api-record-date-field"
          label="날짜"
          required
          value={form.recordDate}
          onChange={(value) => setForm((current) => ({ ...current, recordDate: value }))}
        />
        <label className="form-field">
          <span className="form-label">{form.recordType === '수면' ? '잠든 시간' : '시간'}</span>
          <input className="form-control" inputMode="numeric" maxLength={5} value={form.recordTime || ''} onChange={(event) => setForm((value) => ({ ...value, recordTime: sanitizeTime(event.target.value) }))} />
        </label>
        {form.recordType === '수면' ? (
          <label className="form-field">
            <span className="form-label">깬 시간 <em className="fp-required-mark">*</em></span>
            <input className="form-control" inputMode="numeric" maxLength={5} value={form.sleepEndTime || ''} onChange={(event) => setForm((value) => ({ ...value, sleepEndTime: sanitizeTime(event.target.value) }))} />
          </label>
        ) : null}
        {amountConfig ? (
          <label className="form-field">
            <span className="form-label">{amountConfig.label}</span>
            <input className="form-control" inputMode="numeric" value={form.amountMl || ''} onChange={(event) => setForm((value) => ({ ...value, amountMl: numberOrNull(event.target.value) }))} />
          </label>
        ) : null}
        <label className="form-field baby-api-memo">
          <span className="form-label">메모</span>
          <textarea className="form-control" value={form.memo || ''} onChange={(event) => setForm((value) => ({ ...value, memo: event.target.value }))} />
        </label>
      </div>
      <div className="baby-api-record-actions">
        <button className="cancel-button" type="button" onClick={onReset}>취소</button>
        <button className="save-button" type="submit">{editing ? '수정' : '기록 추가'}</button>
      </div>
    </form>
  )
}

function BabyCustomSelect({ label, required = false, value, options, onChange }: {
  label: string
  required?: boolean
  value: string
  options: readonly { label: string; value: string }[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLLabelElement>(null)
  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    function closeOnOutside(event: MouseEvent | FocusEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('focusin', closeOnOutside)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('focusin', closeOnOutside)
    }
  }, [open])

  return (
    <label className={`fp-field form-field custom-select baby-custom-select ${open ? 'open' : ''}`} ref={rootRef}>
      <span className="form-label">{label}{required ? <em className="fp-required-mark">*</em> : null}</span>
      <button className="custom-select-trigger form-control" type="button" onClick={() => setOpen((current) => !current)}>
        <span>{selected?.label || '선택'}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      <div className="custom-select-list" hidden={!open}>
        {options.map((option) => (
          <button
            className={option.value === value ? 'selected' : ''}
            key={option.value || option.label}
            type="button"
            onClick={() => {
              onChange(option.value)
              setOpen(false)
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </label>
  )
}
