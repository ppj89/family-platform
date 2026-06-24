import { apiRequest } from '../../../shared/api/client'
import type { CommunityBoardType, CommunityComment, CommunityPost, CommunityPostDetail, CommunityPostPayload } from '../types'

export function listCommunityPosts(boardType: CommunityBoardType) {
  return apiRequest<CommunityPost[]>(`/community/posts?boardType=${encodeURIComponent(boardType)}`)
}

export function listCommunityBestPosts(boardType: CommunityBoardType, period: 'daily' | 'weekly' | 'monthly') {
  return apiRequest<CommunityPost[]>(`/community/posts/best?boardType=${encodeURIComponent(boardType)}&period=${encodeURIComponent(period)}`)
}

export function getCommunityPost(id: number) {
  return apiRequest<CommunityPostDetail>(`/community/posts/${encodeURIComponent(String(id))}`)
}

export function createCommunityPost(payload: CommunityPostPayload) {
  return apiRequest<CommunityPost>('/community/posts', { method: 'POST', body: payload })
}

export function updateCommunityPost(id: number, payload: CommunityPostPayload) {
  return apiRequest<CommunityPost>(`/community/posts/${encodeURIComponent(String(id))}`, { method: 'PUT', body: payload })
}

export function deleteCommunityPost(id: number) {
  return apiRequest<null>(`/community/posts/${encodeURIComponent(String(id))}`, { method: 'DELETE' })
}

export function createCommunityComment(postId: number, body: string) {
  return apiRequest<CommunityComment>(`/community/posts/${encodeURIComponent(String(postId))}/comments`, { method: 'POST', body: { body } })
}

export function updateCommunityComment(id: number, body: string) {
  return apiRequest<CommunityComment>(`/community/comments/${encodeURIComponent(String(id))}`, { method: 'PUT', body: { body } })
}

export function deleteCommunityComment(id: number) {
  return apiRequest<null>(`/community/comments/${encodeURIComponent(String(id))}`, { method: 'DELETE' })
}
