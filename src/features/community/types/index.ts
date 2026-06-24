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
  viewCount: number
  periodViewCount?: number
  createdAt: string
  updatedAt: string
}

export interface CommunityComment {
  id: number
  postId: number
  authorId?: number | null
  authorName: string
  body: string
  createdAt: string
  updatedAt: string
}

export interface CommunityPostDetail {
  post: CommunityPost
  comments: CommunityComment[]
}

export interface CommunityPostPayload {
  boardType: CommunityBoardType
  familyId?: number | null
  title: string
  body: string
  mediaUrls: string[]
}
