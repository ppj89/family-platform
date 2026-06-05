import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

export type TravelMapStop = {
  id: number
  order: number
  title: string
  location: string
  latitude?: number
  longitude?: number
}

export type TravelMapDraft = {
  location: string
  latitude?: number
  longitude?: number
}

type ResolvedPoint = {
  id: number
  latitude: number
  location: string
  longitude: number
  order: number
  title: string
}

type LocationCandidate = {
  id: string
  latitude: number
  location: string
  longitude: number
}

const defaultCenter: [number, number] = [36.5, 127.8]

export function TravelRouteMap({ items }: { items: TravelMapStop[] }) {
  const routeItems = useMemo(() => getSortedTravelStops(items), [items])
  const points = useResolvedPoints(routeItems)
  const center = points[0] ? [points[0].latitude, points[0].longitude] as [number, number] : defaultCenter

  return (
    <section className="route-map simple-map" aria-label="여행 위치 지도">
      <MapContainer center={center} className="route-map-osm" scrollWheelZoom={false} zoom={points.length > 1 ? 9 : 10}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitMapToPoints points={points} />
        {points.length > 1 && (
          <Polyline color="#2563eb" opacity={0.82} positions={points.map((point) => [point.latitude, point.longitude])} weight={4} />
        )}
        {points.map((point) => (
          <Marker icon={createOrderIcon(point.order)} key={point.id} position={[point.latitude, point.longitude]}>
            <Popup>
              <strong>{point.order}. {point.title}</strong>
              <br />
              {point.location}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {!routeItems.length && (
        <div className="route-map-empty">장소를 추가하면 여행 위치가 지도에 표시됩니다.</div>
      )}
      {routeItems.length > 0 && (
        <div className="route-sequence compact">
          {routeItems.slice(0, 4).map((item) => (
            <div className="route-sequence-item" key={item.id}>
              <b>{item.order}</b>
              <span>{item.title}</span>
              <small>{item.location || getTravelMapQuery(item)}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function TravelLocationMap({
  draft,
  onDraftChange,
  onUseCurrentLocation,
}: {
  draft: TravelMapDraft
  onDraftChange: (draft: TravelMapDraft) => void
  onNotify: (message: string) => void
  onUseCurrentLocation: () => void
}) {
  const [point, setPoint] = useState<ResolvedPoint | null>(null)
  const [candidates, setCandidates] = useState<LocationCandidate[]>([])
  const mapQuery = normalizeMapQuery(getDraftMapQuery(draft))
  const center = point ? [point.latitude, point.longitude] as [number, number] : defaultCenter

  useEffect(() => {
    let cancelled = false

    async function resolveDraftLocation() {
      if (!mapQuery.trim()) {
        setPoint(null)
        setCandidates([])
        return
      }

      if (hasCoordinates(draft)) {
        const nextPoint = {
          id: 1,
          latitude: draft.latitude as number,
          location: draft.location,
          longitude: draft.longitude as number,
          order: 1,
          title: draft.location || '선택 위치',
        }

        if (!cancelled) {
          setPoint(nextPoint)
          setCandidates([])
        }
        return
      }

      const results = await searchLocations(mapQuery)

      if (cancelled) return
      if (!results.length) {
        setPoint(null)
        setCandidates([])
        return
      }

      const [first] = results
      setPoint({
        id: 1,
        latitude: first.latitude,
        location: first.location,
        longitude: first.longitude,
        order: 1,
        title: draft.location || '선택 위치',
      })
      setCandidates(results)
    }

    const timer = window.setTimeout(resolveDraftLocation, 450)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [draft, mapQuery])

  const handleSelectCandidate = (candidate: LocationCandidate) => {
    setPoint({
      id: 1,
      latitude: candidate.latitude,
      location: candidate.location,
      longitude: candidate.longitude,
      order: 1,
      title: draft.location || '선택 위치',
    })
    setCandidates([])
    onDraftChange({
      ...draft,
      latitude: candidate.latitude,
      location: candidate.location,
      longitude: candidate.longitude,
    })
  }

  return (
    <div className="location-map-box">
      <MapContainer center={center} className="location-map-osm" scrollWheelZoom={false} zoom={point ? 10 : 7}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitMapToPoints points={point ? [point] : []} />
        {point && (
          <Marker icon={createOrderIcon(1)} position={[point.latitude, point.longitude]}>
            <Popup>{point.location}</Popup>
          </Marker>
        )}
      </MapContainer>
      {candidates.length > 0 && (
        <div className="location-candidates">
          <span>위치를 선택해 주세요</span>
          {candidates.map((candidate) => (
            <button key={candidate.id} onClick={() => handleSelectCandidate(candidate)} type="button">
              <b>{candidate.location.split(',')[0]}</b>
              <small>{candidate.location}</small>
            </button>
          ))}
        </div>
      )}
      <div className="location-map-actions">
        <button className="edit-button" onClick={onUseCurrentLocation} type="button">현재 위치 사용</button>
        <a className="map-link" href={buildGoogleMapsPlaceUrl(mapQuery)} rel="noreferrer" target="_blank">지도에서 열기</a>
      </div>
    </div>
  )
}

function FitMapToPoints({ points }: { points: ResolvedPoint[] }) {
  const map = useMap()

  useEffect(() => {
    if (!points.length) {
      map.setView(defaultCenter, 7)
      return
    }

    const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude]))
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 10)
      return
    }
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 11 })
  }, [map, points])

  return null
}

function useResolvedPoints(items: TravelMapStop[]) {
  const [points, setPoints] = useState<ResolvedPoint[]>([])

  useEffect(() => {
    let cancelled = false

    async function resolvePoints() {
      const nextPoints: ResolvedPoint[] = []

      for (const item of items) {
        if (hasCoordinates(item)) {
          nextPoints.push({
            id: item.id,
            latitude: item.latitude as number,
            location: item.location,
            longitude: item.longitude as number,
            order: item.order,
            title: item.title,
          })
          continue
        }

        const result = await geocodeLocation(getTravelMapQuery(item))
        if (result) {
          nextPoints.push({
            id: item.id,
            latitude: result.latitude,
            location: item.location || result.location,
            longitude: result.longitude,
            order: item.order,
            title: item.title,
          })
        }
      }

      if (!cancelled) setPoints(nextPoints)
    }

    resolvePoints()
    return () => {
      cancelled = true
    }
  }, [items])

  return points
}

async function geocodeLocation(query: string) {
  const [result] = await searchLocations(query, 1)
  return result ?? null
}

async function searchLocations(query: string, limit = 5) {
  const normalizedQuery = normalizeMapQuery(query)
  if (!normalizedQuery || normalizedQuery === '대한민국') return []

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=${limit}&countrycodes=kr&accept-language=ko&q=${encodeURIComponent(normalizedQuery)}`)
    if (!response.ok) return []
    const results = await response.json() as Array<{ display_name?: string; lat?: string; lon?: string; place_id?: number }>

    return results
      .map((result, index) => {
        const latitude = Number(result.lat)
        const longitude = Number(result.lon)
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

        return {
          id: String(result.place_id ?? `${latitude}-${longitude}-${index}`),
          latitude,
          location: result.display_name ?? normalizedQuery,
          longitude,
        }
      })
      .filter((result): result is LocationCandidate => Boolean(result))
  } catch {
    return []
  }
}

function createOrderIcon(order: number) {
  return L.divIcon({
    className: 'order-map-marker',
    html: `<span>${order}</span>`,
    iconAnchor: [18, 18],
    iconSize: [36, 36],
    popupAnchor: [0, -16],
  })
}

function getSortedTravelStops(items: TravelMapStop[]) {
  return [...items].sort((left, right) => left.order - right.order)
}

function hasCoordinates(item: TravelMapStop | TravelMapDraft) {
  return typeof item.latitude === 'number' && typeof item.longitude === 'number'
}

function getDraftMapQuery(draft: TravelMapDraft) {
  return hasCoordinates(draft) ? `${draft.latitude},${draft.longitude}` : draft.location || '대한민국'
}

export function getTravelMapQuery(item: TravelMapStop) {
  return hasCoordinates(item) ? `${item.latitude},${item.longitude}` : item.location || item.title
}

export function buildGoogleMapsPlaceUrl(location: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
}

function normalizeMapQuery(query: string) {
  const trimmed = query.trim()
  if (!trimmed) return '대한민국'
  if (/^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(trimmed)) return trimmed
  if (trimmed === '우도') return '우도 제주특별자치도 대한민국'
  if (trimmed.includes('대한민국')) return trimmed
  return `${trimmed} 대한민국`
}

export function buildGoogleMapsRouteUrl(items: TravelMapStop[]) {
  const routeItems = getSortedTravelStops(items).filter((item) => getTravelMapQuery(item).trim())
  if (!routeItems.length) return 'https://www.google.com/maps'
  return buildGoogleMapsPlaceUrl(getTravelMapQuery(routeItems[0]))
}
