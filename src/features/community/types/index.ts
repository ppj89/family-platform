export type CommunityBoardType = 'notice' | 'free' | 'inquiry'

export interface CommunityPost {
  id: number
  boardType: CommunityBoardType
  familyId?: number | null
  authorId?: number | null
  authorName: string
  title: string
  body: string
  mediaUrls: string[]
  isPrivate?: boolean
  commentsEnabled?: boolean
  viewCount: number
  likeCount: number
  dislikeCount: number
  myReaction?: 'like' | 'dislike' | ''
  periodViewCount?: number
  createdAt: string
  updatedAt: string
}

export interface CommunityComment {
  id: number
  postId: number
  parentCommentId?: number | null
  authorId?: number | null
  authorName: string
  body: string
  isDeleted?: boolean
  createdAt: string
  updatedAt: string
}

export interface CommunityPostDetail {
  post: CommunityPost
  comments: CommunityComment[]
}

export interface CommunityPostPage {
  items: CommunityPost[]
  total: number
  page: number
  pageSize: number
}

export interface CommunityPostSearch {
  title?: string
  author?: string
  startDate?: string
  endDate?: string
  sort?: 'latest' | 'oldest' | 'likes' | 'views'
}

export interface CommunityPostPayload {
  boardType: CommunityBoardType
  familyId?: number | null
  title: string
  body: string
  mediaUrls: string[]
  isPrivate: boolean
  commentsEnabled: boolean
}

export interface CommunityHotDealItem {
  source: string
  sourceLabel: string
  title: string
  summary: string
  price: string
  originalUrl: string
  collectedAt: string
  publishedAt: string
  viewCount: number
  commentCount: number
  popularityScore: number
}

export interface CommunityHotDealSource {
  key: string
  label: string
  listingUrl: string
  collectionEnabled: boolean
}

export interface CommunityHotDealResponse {
  items: CommunityHotDealItem[]
  sources: CommunityHotDealSource[]
  refreshedAt: string
  published: boolean
}
