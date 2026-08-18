import { apiRequest } from '../../../shared/api/client'
import type { CommunityBoardType, CommunityComment, CommunityHotDealResponse, CommunityPost, CommunityPostDetail, CommunityPostPage, CommunityPostPayload, CommunityPostSearch } from '../types'

function queryValue(value: string) {
  return encodeURIComponent(value)
}

function pathId(id: number) {
  return encodeURIComponent(String(id))
}

export function listCommunityPosts(boardType: CommunityBoardType, page: number, pageSize: number, search: CommunityPostSearch = {}) {
  const query = new URLSearchParams({ boardType, page: String(page), pageSize: String(pageSize) })
  if (search.title?.trim()) query.set('title', search.title.trim())
  if (search.author?.trim()) query.set('author', search.author.trim())
  if (search.startDate) query.set('startDate', search.startDate)
  if (search.endDate) query.set('endDate', search.endDate)
  if (search.sort && search.sort !== 'latest') query.set('sort', search.sort)
  return apiRequest<CommunityPostPage>(`/community/posts?${query.toString()}`)
}

export function listCommunityBestPosts(boardType: CommunityBoardType, period: 'daily' | 'weekly' | 'monthly') {
  return apiRequest<CommunityPost[]>(`/community/posts/best?boardType=${queryValue(boardType)}&period=${queryValue(period)}`)
}

export function listCommunityHotDeals(keyword = '') {
	const query = keyword.trim() ? `?q=${queryValue(keyword.trim())}` : ''
	return apiRequest<CommunityHotDealResponse>(`/community/deals${query}`)
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

export function reactToCommunityPost(id: number, reaction: 'like' | 'dislike') {
  return apiRequest<CommunityPost>(`/community/posts/${pathId(id)}/reaction`, { method: 'POST', body: { reaction } })
}

export function createCommunityComment(postId: number, body: string, parentCommentId?: number) {
  return apiRequest<CommunityComment>(`/community/posts/${pathId(postId)}/comments`, {
    method: 'POST',
    body: { body, ...(parentCommentId ? { parentCommentId } : {}) },
  })
}

export function updateCommunityComment(id: number, body: string) {
  return apiRequest<CommunityComment>(`/community/comments/${pathId(id)}`, { method: 'PUT', body: { body } })
}

export function deleteCommunityComment(id: number) {
  return apiRequest<null>(`/community/comments/${pathId(id)}`, { method: 'DELETE' })
}
