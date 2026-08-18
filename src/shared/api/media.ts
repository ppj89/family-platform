import { apiFormRequest } from './client'
import { getReadableFamilyId } from './family'

export interface MediaUploadResult {
  url: string
  storedFileName: string
  originalFileName: string
  contentType: string
  size: number
}

export async function uploadMedia(file: File, familyId?: number) {
  const nextFamilyId = familyId ?? await getReadableFamilyId()
  const formData = new FormData()
  formData.append('file', file)
  const query = nextFamilyId > 0 ? `?familyId=${encodeURIComponent(String(nextFamilyId))}` : ''
  return apiFormRequest<MediaUploadResult>(`/media${query}`, formData)
}

export function mediaThumbnailUrl(url: string) {
  if (!url.includes('/api/media/files/')) return url
  try {
    const parsed = new URL(url, window.location.origin)
    parsed.searchParams.set('variant', 'thumbnail')
    parsed.searchParams.set('v', '2')
    return url.startsWith('/') ? `${parsed.pathname}${parsed.search}` : parsed.toString()
  } catch {
    return url
  }
}

// A 1600px JPEG is much faster than an original camera file while remaining sharp in detail cards.
export function mediaDisplayUrl(url: string) {
  if (!url.includes('/api/media/files/')) return url
  try {
    const parsed = new URL(url, window.location.origin)
    parsed.searchParams.set('variant', 'display')
    parsed.searchParams.set('v', '1')
    return url.startsWith('/') ? `${parsed.pathname}${parsed.search}` : parsed.toString()
  } catch {
    return url
  }
}
