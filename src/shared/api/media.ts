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
