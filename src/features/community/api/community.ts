import { apiRequest } from '../../../shared/api/client'
import type { CommunityBoardType, CommunityComment, CommunityPost, CommunityPostDetail, CommunityPostPayload } from '../types'

function queryValue(value: string) {
  return encodeURIComponent(value)
}

function pathId(id: number) {
  return encodeURIComponent(String(id))
}

export function listCommunityPosts(boardType: CommunityBoardType) {
  return apiRequest<CommunityPost[]>(`/community/posts?boardType=${queryValue(boardType)}`)
}

export function listCommunityBestPosts(boardType: CommunityBoardType, period: 'daily' | 'weekly' | 'monthly') {
  return apiRequest<CommunityPost[]>(`/community/posts/best?boardType=${queryValue(boardType)}&period=${queryValue(period)}`)
}

export function getCommunityPost(id: number) {
  return apiRequest<CommunityPostDetail>(`/community/posts/${pathId(id)}`)
}

export function createCommunityPost(payload: CommunityPostPayload) {
  return apiRequest<CommunityPost>('/community/posts', { method: 'POST', body: payload })
}

export function updateCommunityPost(id: number, payload: CommunityPostPayload) {
  return apiRequest<CommunityPost>(`/community/posts/${pathId(id)}`, { method: 'PUT', body: payload })
}

export function deleteCommunityPost(id: number) {
  return apiRequest<null>(`/community/posts/${pathId(id)}`, { method: 'DELETE' })
}

export function createCommunityComment(postId: number, body: string) {
  return apiRequest<CommunityComment>(`/community/posts/${pathId(postId)}/comments`, { method: 'POST', body: { body } })
}

export function updateCommunityComment(id: number, body: string) {
  return apiRequest<CommunityComment>(`/community/comments/${pathId(id)}`, { method: 'PUT', body: { body } })
}

export function deleteCommunityComment(id: number) {
  return apiRequest<null>(`/community/comments/${pathId(id)}`, { method: 'DELETE' })
}
