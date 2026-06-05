import { apiRequest } from './client'

export type CommunityBoardType = 'notice' | 'free' | 'inquiry' | string

export type CommunityPost = {
  id: number
  boardType: CommunityBoardType
  familyId?: number
  authorId?: number
  authorName: string
  title: string
  body: string
  mediaUrls: string[]
  createdAt: string
  updatedAt: string
}

export type CommunityComment = {
  id: number
  postId: number
  authorId?: number
  authorName: string
  body: string
  createdAt: string
  updatedAt: string
}

export type CommunityPostDetail = {
  post: CommunityPost
  comments: CommunityComment[]
}

export type CommunityPostPayload = {
  boardType: CommunityBoardType
  familyId?: number
  title: string
  body: string
  mediaUrls?: string[]
}

export type CommunityCommentPayload = {
  body: string
}

export function getCommunityPosts(boardType: CommunityBoardType, familyId?: number) {
  const familyQuery = familyId === undefined ? '' : `&familyId=${familyId}`
  return apiRequest<CommunityPost[]>(`/community/posts?boardType=${boardType}${familyQuery}`)
}

export function getCommunityPost(postId: number) {
  return apiRequest<CommunityPostDetail>(`/community/posts/${postId}`)
}

export function createCommunityPost(payload: CommunityPostPayload) {
  return apiRequest<CommunityPost>('/community/posts', {
    method: 'POST',
    body: payload,
  })
}

export function updateCommunityPost(postId: number, payload: CommunityPostPayload) {
  return apiRequest<CommunityPost>(`/community/posts/${postId}`, {
    method: 'PUT',
    body: payload,
  })
}

export function deleteCommunityPost(postId: number) {
  return apiRequest<void>(`/community/posts/${postId}`, {
    method: 'DELETE',
  })
}

export function createCommunityComment(postId: number, payload: CommunityCommentPayload) {
  return apiRequest<CommunityComment>(`/community/posts/${postId}/comments`, {
    method: 'POST',
    body: payload,
  })
}

export function updateCommunityComment(commentId: number, payload: CommunityCommentPayload) {
  return apiRequest<CommunityComment>(`/community/comments/${commentId}`, {
    method: 'PUT',
    body: payload,
  })
}

export function deleteCommunityComment(commentId: number) {
  return apiRequest<void>(`/community/comments/${commentId}`, {
    method: 'DELETE',
  })
}
