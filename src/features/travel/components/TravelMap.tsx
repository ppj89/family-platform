import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { TravelRecord } from '../types'

interface TravelMapProps {
  records?: TravelRecord[]
  point?: { latitude: number; longitude: number; label?: string } | null
  className?: string
}

const defaultCenter: [number, number] = [36.35, 127.8]

function hasCoordinates(record: Pick<TravelRecord, 'latitude' | 'longitude'>) {
  return Number.isFinite(record.latitude) && Number.isFinite(record.longitude) && record.latitude !== 0 && record.longitude !== 0
}

function markerIcon(label: string) {
  return L.divIcon({
    className: 'fp-travel-map-marker',
    html: `<span>${label}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}

export default function TravelMap({ records = [], point = null, className = '' }: TravelMapProps) {
  const mapNode = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  const points = useMemo(() => {
    if (point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && point.latitude !== 0 && point.longitude !== 0) {
      return [{ latitude: point.latitude, longitude: point.longitude, title: point.label || '선택 위치', order: '1' }]
    }
    return records
      .filter(hasCoordinates)
      .sort((a, b) => (a.sortOrder || 9999) - (b.sortOrder || 9999) || a.recordDate.localeCompare(b.recordDate))
      .map((record, index) => ({
        latitude: record.latitude,
        longitude: record.longitude,
        title: record.title || record.location || '여행 기록',
        order: String(record.sortOrder || index + 1).padStart(2, '0'),
      }))
  }, [point, records])

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return
    mapRef.current = L.map(mapNode.current, { zoomControl: true, attributionControl: true }).setView(defaultCenter, 7)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(mapRef.current)
    layerRef.current = L.layerGroup().addTo(mapRef.current)
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()

    if (!points.length) {
      map.setView(defaultCenter, 7)
      setTimeout(() => map.invalidateSize(), 0)
      return
    }

    const latLngs = points.map((item) => L.latLng(item.latitude, item.longitude))
    points.forEach((item) => {
      L.marker([item.latitude, item.longitude], { icon: markerIcon(item.order) })
        .bindTooltip(item.title, { direction: 'top', offset: [0, -14] })
        .addTo(layer)
    })
    if (latLngs.length > 1) {
      L.polyline(latLngs, { color: '#3182f6', weight: 4, opacity: 0.85 }).addTo(layer)
      map.fitBounds(L.latLngBounds(latLngs), { padding: [30, 30] })
    } else {
      map.setView(latLngs[0], 13)
    }
    setTimeout(() => map.invalidateSize(), 0)
  }, [points])

  return (
    <div className={`fp-travel-map ${className}`}>
      <div ref={mapNode} />
      {!points.length ? <span className="fp-travel-map-empty">위치를 선택하면 지도에 표시됩니다.</span> : null}
    </div>
  )
}
