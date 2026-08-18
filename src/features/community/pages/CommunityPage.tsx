import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HiOutlineX } from 'react-icons/hi'
import { RiThumbDownFill, RiThumbDownLine, RiThumbUpFill, RiThumbUpLine } from 'react-icons/ri'
import { apiActionMessage } from '../../../shared/api/client'
import { getStoredUser } from '../../../shared/api/auth'
import { mediaDisplayUrl, uploadMedia } from '../../../shared/api/media'
import { ConfirmDialog, CustomSelect, DatePickerField, FloatingActionButton, MediaPreviewDialog, ToastMessage } from '../../../shared/components'
import {
  createCommunityComment,
  createCommunityPost,
  deleteCommunityComment,
  deleteCommunityPost,
  getCommunityPost,
  listCommunityPosts,
  reactToCommunityPost,
  updateCommunityComment,
  updateCommunityPost,
} from '../api/community'
import type { CommunityBoardType, CommunityComment, CommunityPost, CommunityPostPayload, CommunityPostSearch } from '../types'
import './community-page.css'

type ConfirmState = {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
}

type ViewMode = 'list' | 'detail'
type CommunityTab = CommunityBoardType

const boardLabels: Record<CommunityBoardType, string> = {
  notice: '공지사항',
  free: '자유게시판',
  inquiry: '문의사항',
}

const initialForm = { title: '', body: '', mediaUrls: [] as string[], isPrivate: false, commentsEnabled: true }
const pageSize = 10
const initialSearch: CommunityPostSearch = { title: '', author: '', startDate: '', endDate: '', sort: 'latest' }
const postTitleMaxLength = 255
const postBodyMaxLength = 5000
const commentMaxLength = 1000
const maxMediaPerPost = 5

function formatInstant(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function canWriteBoard(board: CommunityBoardType, platformAdmin: boolean) {
  return board !== 'notice' || platformAdmin
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|ogg)(\?|#|$)/i.test(url)
}

function mediaName(url: string) {
  try {
    const path = new URL(url, window.location.origin).pathname
    return decodeURIComponent(path.split('/').pop() || url)
  } catch {
    return url.split('/').pop() || url
  }
}

export default function CommunityPage() {
  const user = useMemo(() => getStoredUser(), [])
  const platformAdmin = Boolean(user?.platformAdmin)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeBoard, setActiveBoard] = useState<CommunityTab>('notice')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [totalPosts, setTotalPosts] = useState(0)
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null)
  const [comments, setComments] = useState<CommunityComment[]>([])
  const [form, setForm] = useState(initialForm)
  const [searchTitle, setSearchTitle] = useState('')
  const [searchAuthor, setSearchAuthor] = useState('')
  const [searchStartDate, setSearchStartDate] = useState('')
  const [searchEndDate, setSearchEndDate] = useState('')
  const [appliedSearch, setAppliedSearch] = useState(initialSearch)
  const [sort, setSort] = useState<NonNullable<CommunityPostSearch['sort']>>('latest')
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false)
  const [isWriteDialogOpen, setIsWriteDialogOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null)
  const [commentText, setCommentText] = useState('')
  const [editingComment, setEditingComment] = useState<CommunityComment | null>(null)
  const [replyToComment, setReplyToComment] = useState<CommunityComment | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [mediaPreview, setMediaPreview] = useState<{ file?: File; url?: string; title: string; initialIndex?: number; items?: Array<{ file?: File; url?: string; title?: string }> } | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const writable = canWriteBoard(activeBoard, platformAdmin)
  const supportsPrivateOption = activeBoard === 'inquiry'
  const supportsCommentOption = activeBoard === 'notice' || activeBoard === 'free'
  const boardTitle = boardLabels[activeBoard]
  const canManageSelectedPost = Boolean(selectedPost && (platformAdmin || selectedPost.authorId === user?.id))
  const totalPages = Math.max(1, Math.ceil(totalPosts / pageSize))
  const rootComments = useMemo(() => comments.filter((comment) => !comment.parentCommentId), [comments])
  const repliesByParent = useMemo(() => comments.reduce<Record<number, CommunityComment[]>>((groups, comment) => {
    if (comment.parentCommentId) (groups[comment.parentCommentId] ||= []).push(comment)
    return groups
  }, {}), [comments])
  async function loadPosts(board: CommunityBoardType = activeBoard, requestedPage = page, search: CommunityPostSearch = appliedSearch) {
    setLoading(true)
    try {
      const result = await listCommunityPosts(board, requestedPage, pageSize, search)
      setPosts(result.items)
      setTotalPosts(result.total)
      setPage(result.page)
    } catch (error) {
      setPosts([])
      setTotalPosts(0)
      setToastMessage(apiActionMessage(error, '게시글을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  const openPostByID = useCallback(async (postID: number, targetCommentID?: number) => {
    setLoading(true)
    try {
      const detail = await getCommunityPost(postID)
      setSelectedPost(detail.post)
      setComments(detail.comments || [])
      setEditingPost(null)
      setCommentText('')
      setEditingComment(null)
      setReplyToComment(null)
      setViewMode('detail')
      if (targetCommentID) {
        window.setTimeout(() => document.getElementById(`community-comment-${targetCommentID}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
      }
    } catch (error) {
      setToastMessage(apiActionMessage(error, '게시글 상세를 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }, [])

  async function openPost(post: CommunityPost) {
    await openPostByID(post.id)
  }

  async function refreshSelectedPost() {
    if (!selectedPost) return
    try {
      const detail = await getCommunityPost(selectedPost.id)
      setSelectedPost(detail.post)
      setComments(detail.comments || [])
    } catch (error) {
      setToastMessage(apiActionMessage(error, '게시글 상세를 다시 불러오지 못했습니다.'))
    }
  }

  useEffect(() => {
    setViewMode('list')
    setSelectedPost(null)
    setComments([])
    setEditingPost(null)
    setEditingComment(null)
    setReplyToComment(null)
    setCommentText('')
    setForm(initialForm)
    setSearchTitle('')
    setSearchAuthor('')
    setSearchStartDate('')
    setSearchEndDate('')
    setAppliedSearch(initialSearch)
    setSort('latest')
    setPage(1)
    setIsWriteDialogOpen(false)
    void loadPosts(activeBoard, 1, initialSearch)
  }, [activeBoard])

  useEffect(() => {
    if (isWriteDialogOpen) {
      window.setTimeout(() => titleInputRef.current?.focus(), 100)
    }
  }, [isWriteDialogOpen])

  useEffect(() => {
    const openNotificationTarget = () => {
      const stored = window.sessionStorage.getItem('family-platform-community-target')
      if (!stored) return
      window.sessionStorage.removeItem('family-platform-community-target')
      try {
        const target = JSON.parse(stored) as { postId?: number; commentId?: number }
        if (Number.isInteger(target.postId) && Number(target.postId) > 0) {
          void openPostByID(Number(target.postId), Number.isInteger(target.commentId) ? Number(target.commentId) : undefined)
        }
      } catch {
        // Ignore malformed notification navigation data.
      }
    }
    openNotificationTarget()
    window.addEventListener('family-platform-community-open', openNotificationTarget)
    return () => window.removeEventListener('family-platform-community-open', openNotificationTarget)
  }, [openPostByID])

  function resetForm() {
    setForm(initialForm)
    setEditingPost(null)
    setSelectedFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function goList() {
    resetForm()
    setIsWriteDialogOpen(false)
    setSelectedPost(null)
    setComments([])
    setCommentText('')
    setEditingComment(null)
    setReplyToComment(null)
    setViewMode('list')
    void loadPosts(activeBoard, page)
  }

  function startWrite() {
    if (!writable) {
      setToastMessage('공지사항은 관리자만 작성할 수 있습니다.')
      return
    }
    resetForm()
    setIsWriteDialogOpen(true)
  }

  function closeWriteDialog() {
    resetForm()
    setIsWriteDialogOpen(false)
  }

  function applySearch() {
    const search = { title: searchTitle, author: searchAuthor, startDate: searchStartDate, endDate: searchEndDate, sort }
    setAppliedSearch(search)
    setPage(1)
    setIsSearchDialogOpen(false)
    void loadPosts(activeBoard, 1, search)
  }

  function resetSearch() {
    setSearchTitle('')
    setSearchAuthor('')
    setSearchStartDate('')
    setSearchEndDate('')
    setAppliedSearch(initialSearch)
    setSort('latest')
    setPage(1)
    setIsSearchDialogOpen(false)
    void loadPosts(activeBoard, 1, initialSearch)
  }

  function changeSort(value: string) {
    const nextSort = value as NonNullable<CommunityPostSearch['sort']>
    const nextSearch = { ...appliedSearch, sort: nextSort }
    setSort(nextSort)
    setAppliedSearch(nextSearch)
    setPage(1)
    void loadPosts(activeBoard, 1, nextSearch)
  }

  async function reactToPost(reaction: 'like' | 'dislike') {
    if (!selectedPost) return
    setLoading(true)
    try {
      const updated = await reactToCommunityPost(selectedPost.id, reaction)
      setSelectedPost(updated)
      setPosts((items) => items.map((item) => item.id === updated.id ? { ...item, likeCount: updated.likeCount, dislikeCount: updated.dislikeCount, myReaction: updated.myReaction } : item))
    } catch (error) {
      setToastMessage(apiActionMessage(error, '반응을 저장하지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  async function savePost() {
    if (!writable) {
      setToastMessage('공지사항은 관리자만 작성할 수 있습니다.')
      return
    }
    if (!form.title.trim()) {
      setToastMessage('제목을 입력해주세요.')
      titleInputRef.current?.focus()
      return
    }
    setLoading(true)
    try {
      const uploaded = selectedFiles.length ? await Promise.all(selectedFiles.map((file) => uploadMedia(file))) : []
      const payload: CommunityPostPayload = {
        boardType: activeBoard,
        familyId: null,
        title: form.title.trim(),
        body: form.body.trim(),
        mediaUrls: [...form.mediaUrls, ...uploaded.map((item) => item.url)],
        isPrivate: supportsPrivateOption ? form.isPrivate : false,
        commentsEnabled: supportsCommentOption ? form.commentsEnabled : true,
      }
      const isEditing = Boolean(editingPost)
      const saved = editingPost ? await updateCommunityPost(editingPost.id, payload) : await createCommunityPost(payload)
      resetForm()
      setIsWriteDialogOpen(false)
      setPage(1)
      await loadPosts(activeBoard, 1)
      if (payload.isPrivate) {
        setViewMode('list')
        setToastMessage(isEditing ? '게시글을 수정했습니다.' : '비공개 문의를 등록했습니다.')
        return
      }
      await openPost(saved)
      setToastMessage(isEditing ? '게시글을 수정했습니다.' : '게시글을 등록했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, '게시글을 저장하지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  function requestSavePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!writable) {
      setToastMessage('공지사항은 관리자만 작성할 수 있습니다.')
      return
    }
    const isEditing = Boolean(editingPost)
    setConfirm({
      title: isEditing ? '수정' : '등록',
      body: isEditing ? '게시글을 수정하시겠습니까?' : '게시글을 등록하시겠습니까?',
      confirmLabel: isEditing ? '수정' : '등록',
      onConfirm: () => {
        setConfirm(null)
        void savePost()
      },
    })
  }

  function startEditPost(post: CommunityPost) {
    setEditingPost(post)
    setForm({
      title: post.title,
      body: post.body || '',
      mediaUrls: post.mediaUrls || [],
      isPrivate: Boolean(post.isPrivate),
      commentsEnabled: post.commentsEnabled !== false,
    })
    setSelectedFiles([])
    setIsWriteDialogOpen(true)
  }

  function requestDeletePost(post: CommunityPost) {
    setConfirm({
      title: '삭제',
      body: '게시글을 삭제하시겠습니까?',
      confirmLabel: '삭제',
      danger: true,
      onConfirm: async () => {
        setConfirm(null)
        setLoading(true)
        try {
          await deleteCommunityPost(post.id)
          setSelectedPost(null)
          setComments([])
          await loadPosts(activeBoard, page)
          setViewMode('list')
          setToastMessage('게시글을 삭제했습니다.')
        } catch (error) {
          setToastMessage(apiActionMessage(error, '게시글을 삭제하지 못했습니다.'))
        } finally {
          setLoading(false)
        }
      },
    })
  }

  async function saveComment() {
    const body = commentText.trim()
    if (selectedPost?.commentsEnabled === false) {
      setToastMessage('댓글을 사용하지 않는 글입니다.')
      return
    }
    if (!selectedPost || !body) {
      window.setTimeout(() => document.querySelector<HTMLInputElement>('[data-required-field="community-comment"]')?.focus(), 0)
      setToastMessage('댓글 내용을 입력해주세요.')
      return
    }
    setLoading(true)
    try {
      const isEditing = Boolean(editingComment)
      const isReply = Boolean(replyToComment)
      if (editingComment) {
        await updateCommunityComment(editingComment.id, body)
        setEditingComment(null)
      } else {
        await createCommunityComment(selectedPost.id, body, replyToComment?.id)
      }
      setCommentText('')
      setReplyToComment(null)
      await refreshSelectedPost()
      setToastMessage(isEditing ? '댓글을 수정했습니다.' : isReply ? '대댓글을 등록했습니다.' : '댓글을 등록했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, '댓글을 저장하지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  function requestSaveComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const isEditing = Boolean(editingComment)
    const isReply = Boolean(replyToComment)
    setConfirm({
      title: isEditing ? '수정' : '등록',
      body: isEditing ? '댓글을 수정하시겠습니까?' : isReply ? '대댓글을 등록하시겠습니까?' : '댓글을 등록하시겠습니까?',
      confirmLabel: isEditing ? '수정' : '등록',
      onConfirm: () => {
        setConfirm(null)
        void saveComment()
      },
    })
  }

  function startReply(comment: CommunityComment) {
    setEditingComment(null)
    setReplyToComment(comment)
    setCommentText('')
    window.setTimeout(() => document.querySelector<HTMLInputElement>('[data-required-field="community-comment"]')?.focus(), 0)
  }

  function requestDeleteComment(comment: CommunityComment) {
    setConfirm({
      title: '삭제',
      body: '댓글을 삭제하시겠습니까?',
      confirmLabel: '삭제',
      danger: true,
      onConfirm: async () => {
        setConfirm(null)
        setLoading(true)
        try {
          await deleteCommunityComment(comment.id)
          await refreshSelectedPost()
          setToastMessage('댓글을 삭제했습니다.')
        } catch (error) {
          setToastMessage(apiActionMessage(error, '댓글을 삭제하지 못했습니다.'))
        } finally {
          setLoading(false)
        }
      },
    })
  }

  return (
    <section className="fp-community">
      {loading ? <div className="fp-loading-blocker">처리 중</div> : null}
      <ToastMessage message={toastMessage} onClose={() => setToastMessage('')} />

      <header className="fp-community-header fp-card">
        <div className="fp-community-tabs" role="tablist" aria-label="커뮤니티 게시판">
          {(Object.keys(boardLabels) as CommunityTab[]).map((board) => (
            <button
              className={activeBoard === board ? 'active' : ''}
              key={board}
              type="button"
              role="tab"
              aria-selected={activeBoard === board}
              onClick={() => setActiveBoard(board)}
            >
              {boardLabels[board]}
            </button>
          ))}
        </div>
      </header>

      {viewMode === 'list' ? (
        <section className="fp-card fp-community-list">
          <header>
            <div className="fp-community-list-heading">
              <div className="fp-community-title-row">
                <div>
                  <h3>{boardTitle}</h3>
                </div>
                <div className="fp-community-title-actions">
                  <span>{totalPosts}건</span>
                  <button className="fp-button fp-button-muted fp-community-search-open-button" type="button" onClick={() => setIsSearchDialogOpen(true)}>조회</button>
                </div>
              </div>
            </div>
          </header>

          {activeBoard === 'free' ? (
            <div className="fp-community-sort-row">
              <CustomSelect
                ariaLabel="자유게시판 정렬"
                options={[
                  { value: 'latest', label: '최신순' },
                  { value: 'oldest', label: '오래된순' },
                  { value: 'likes', label: '좋아요순' },
                  { value: 'views', label: '조회순' },
                ]}
                value={sort}
                onChange={changeSort}
              />
            </div>
          ) : null}

          <div className="fp-community-posts">
            {posts.length ? posts.map((post) => (
              <button className="fp-community-row" type="button" key={post.id} onClick={() => void openPost(post)}>
                <strong className="fp-ellipsis" title={post.title}>{post.title}</strong>
                <span>{formatInstant(post.createdAt)}</span>
                {activeBoard === 'free' ? <span>좋아요 {post.likeCount}</span> : null}
                <span>조회 {post.viewCount}</span>
              </button>
            )) : <p className="fp-empty-text">{posts.length ? '조회 조건에 맞는 게시글이 없습니다.' : '등록된 게시글이 없습니다.'}</p>}
          </div>
          {totalPosts > pageSize ? (
            <nav className="fp-community-pagination" aria-label="게시글 페이지">
              <button type="button" disabled={page <= 1} onClick={() => void loadPosts(activeBoard, page - 1)}>이전</button>
              <span>{page} / {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => void loadPosts(activeBoard, page + 1)}>다음</button>
            </nav>
          ) : null}
        </section>
      ) : null}

      {writable && !isWriteDialogOpen ? (
        <FloatingActionButton ariaLabel="글쓰기" onClick={startWrite} />
      ) : null}

      {isSearchDialogOpen ? (
        <div className="fp-community-search-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsSearchDialogOpen(false)
        }}>
          <section className="fp-community-search-dialog" role="dialog" aria-modal="true" aria-label={`${boardTitle} 조건 조회`}>
            <header>
              <h3>조건 조회</h3>
              <button type="button" aria-label="닫기" onClick={() => setIsSearchDialogOpen(false)}>
                <HiOutlineX aria-hidden="true" />
              </button>
            </header>
            <label className="fp-field">
              <span>제목</span>
              <input value={searchTitle} onChange={(event) => setSearchTitle(event.target.value)} placeholder="제목 검색" />
            </label>
            <label className="fp-field">
              <span>글쓴이</span>
              <input value={searchAuthor} onChange={(event) => setSearchAuthor(event.target.value)} placeholder="닉네임 검색" />
            </label>
            <div className="fp-community-search-period">
              <DatePickerField className="fp-community-search-date" label="시작일" showCalendarIcon value={searchStartDate} onChange={setSearchStartDate} />
              <DatePickerField className="fp-community-search-date" label="종료일" showCalendarIcon value={searchEndDate} onChange={setSearchEndDate} />
            </div>
            <div className="fp-community-search-actions">
              <button className="fp-button fp-button-muted" type="button" onClick={resetSearch}>초기화</button>
              <button className="fp-button fp-button-primary" type="button" onClick={applySearch}>조회</button>
            </div>
          </section>
        </div>
      ) : null}

      {isWriteDialogOpen ? (
        <div className="fp-community-form-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeWriteDialog()
        }}>
        <form className="fp-card fp-community-form fp-community-form-dialog" onSubmit={requestSavePost}>
          <header>
            <div>
              <h3>{editingPost ? '게시글 수정' : '글 작성'}</h3>
            </div>
            <button className="fp-community-close-button" type="button" aria-label="닫기" onClick={closeWriteDialog}>
              <HiOutlineX aria-hidden="true" />
            </button>
          </header>
          <div className="fp-community-form-scroll">
          {!writable ? <p className="fp-community-lock">공지사항은 관리자만 작성할 수 있습니다.</p> : null}
          <label className="fp-field">
            <span>제목 <em className="fp-required-mark">*</em></span>
            <input
              ref={titleInputRef}
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              maxLength={postTitleMaxLength}
              disabled={!writable}
            />
          </label>
          <label className="fp-field">
            <span>내용</span>
            <textarea
              value={form.body}
              onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
              maxLength={postBodyMaxLength}
              disabled={!writable}
            />
          </label>
          {supportsPrivateOption ? (
            <label className="fp-community-option">
              <input
                type="checkbox"
                checked={form.isPrivate}
                onChange={(event) => setForm((prev) => ({ ...prev, isPrivate: event.target.checked }))}
                disabled={!writable}
              />
              <span>비공개</span>
              <small>플랫폼 관리자만 볼 수 있습니다.</small>
            </label>
          ) : null}
          {supportsCommentOption ? (
            <label className="fp-community-option">
              <input
                type="checkbox"
                checked={!form.commentsEnabled}
                onChange={(event) => setForm((prev) => ({ ...prev, commentsEnabled: !event.target.checked }))}
                disabled={!writable}
              />
              <span>댓글 미사용</span>
              <small>체크하면 댓글과 답글을 등록할 수 없습니다.</small>
            </label>
          ) : null}
          <div className="fp-field fp-community-file-field">
            <span>사진첨부</span>
            <div className="fp-community-file-picker">
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!writable}>
                사진첨부
              </button>
              <small>{selectedFiles.length ? `${selectedFiles.length}개 선택됨` : '이미지/영상 첨부 가능'}</small>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                disabled={!writable}
                onChange={(event) => {
                  const files = Array.from(event.target.files || [])
                  const remaining = Math.max(0, maxMediaPerPost - form.mediaUrls.length)
                  const filesToUpload = files.slice(0, remaining)
                  if (filesToUpload.length < files.length) {
                    setToastMessage(`사진·영상은 게시글 1건당 최대 ${maxMediaPerPost}개까지 등록할 수 있습니다.`)
                  }
                  setSelectedFiles(filesToUpload)
                  if (filesToUpload[0]) setMediaPreview({
                    title: filesToUpload[0].name,
                    items: filesToUpload.map((file) => ({ file, title: file.name })),
                  })
                  event.target.value = ''
                }}
              />
            </div>
          </div>
          {form.mediaUrls.length || selectedFiles.length ? (
            <div className="fp-community-media-list" aria-label="첨부파일 목록">
              {form.mediaUrls.map((url) => (
                <span key={url}>
                  {mediaName(url)}
                  <button type="button" aria-label={`${mediaName(url)} 삭제`} onClick={() => setForm((prev) => ({ ...prev, mediaUrls: prev.mediaUrls.filter((item) => item !== url) }))}>
                    삭제
                  </button>
                </span>
              ))}
              {selectedFiles.map((file) => (
                <span key={`${file.name}-${file.size}`}>
                  {file.name}
                  <button type="button" aria-label={`${file.name} 삭제`} onClick={() => setSelectedFiles((files) => files.filter((item) => item !== file))}>
                    삭제
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          </div>
          <div className="fp-community-submit-row fp-dialog-action-footer">
            <button className="fp-button fp-button-muted" type="button" onClick={closeWriteDialog}>취소</button>
            <button className="fp-button fp-button-primary" type="submit" disabled={!writable}>
              {editingPost ? '저장' : '등록'}
            </button>
          </div>
        </form>
        </div>
      ) : null}

      {viewMode === 'detail' && selectedPost ? (
        <section className="fp-card fp-community-detail">
          <header>
            <button className="fp-button fp-button-muted" type="button" onClick={goList}>목록</button>
            <div className="fp-community-detail-actions">
              {canManageSelectedPost ? (
                <div className="fp-row-actions">
                <button type="button" onClick={() => startEditPost(selectedPost)}>수정</button>
                <button className="danger" type="button" onClick={() => requestDeletePost(selectedPost)}>삭제</button>
                </div>
              ) : null}
            </div>
          </header>
          <article className="fp-community-detail-article">
            <div className="fp-community-detail-title-row">
              <h3>{selectedPost.title}</h3>
              <span>조회 {selectedPost.viewCount}</span>
            </div>
            <div className="fp-community-detail-meta">
              <span>글쓴이 <b>{selectedPost.authorName}</b></span>
              <span>등록일시 <b>{formatInstant(selectedPost.createdAt)}</b></span>
            </div>
            <div className="fp-community-detail-body">{selectedPost.body || '내용 없음'}</div>
            {selectedPost.boardType === 'free' ? (
              <div className="fp-community-reactions" aria-label="게시글 반응">
                <button className={selectedPost.myReaction === 'like' ? 'active like' : 'like'} type="button" aria-label={`좋아요 ${selectedPost.likeCount}`} title="좋아요" onClick={() => void reactToPost('like')}>
                  {selectedPost.myReaction === 'like' ? <RiThumbUpFill aria-hidden="true" /> : <RiThumbUpLine aria-hidden="true" />}
                  <span>{selectedPost.likeCount}</span>
                </button>
                <button className={selectedPost.myReaction === 'dislike' ? 'active dislike' : 'dislike'} type="button" aria-label={`싫어요 ${selectedPost.dislikeCount}`} title="싫어요" onClick={() => void reactToPost('dislike')}>
                  {selectedPost.myReaction === 'dislike' ? <RiThumbDownFill aria-hidden="true" /> : <RiThumbDownLine aria-hidden="true" />}
                  <span>{selectedPost.dislikeCount}</span>
                </button>
              </div>
            ) : null}
            {selectedPost.mediaUrls?.length ? (
              <div className="fp-community-media-grid">
                {selectedPost.mediaUrls.map((url, index) => (
                  <button className="fp-community-media-preview" type="button" key={url} onClick={() => setMediaPreview({
                    title: mediaName(url),
                    initialIndex: index,
                    items: selectedPost.mediaUrls.map((item) => ({ url: item, title: mediaName(item) })),
                  })}>
                    {isVideoUrl(url) ? <video src={url} controls preload="metadata" /> : <img src={mediaDisplayUrl(url)} alt="사진" loading={index === 0 ? 'eager' : 'lazy'} decoding="async" />}
                  </button>
                ))}
              </div>
            ) : null}
          </article>
          {selectedPost.commentsEnabled !== false ? <section className="fp-community-comments">
            <strong>댓글 {comments.length}</strong>
            {rootComments.length ? rootComments.map((comment) => (
              <div className="fp-community-comment-thread" key={comment.id}>
                <div className={['fp-community-comment', comment.isDeleted ? 'deleted' : ''].filter(Boolean).join(' ')} id={`community-comment-${comment.id}`}>
                  <div>
                    <b>{comment.authorName}</b>
                    <span>{formatInstant(comment.createdAt)}</span>
                  </div>
                  <p>{comment.body}</p>
                  {!comment.isDeleted ? (
                    <div className="fp-row-actions">
                      <button type="button" onClick={() => startReply(comment)}>답글</button>
                      {platformAdmin || comment.authorId === user?.id ? (
                        <>
                          <button type="button" onClick={() => {
                            setReplyToComment(null)
                            setEditingComment(comment)
                            setCommentText(comment.body)
                          }}>수정</button>
                          <button className="danger" type="button" onClick={() => requestDeleteComment(comment)}>삭제</button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {(repliesByParent[comment.id] || []).map((reply) => (
                  <div className={['fp-community-comment', 'reply', reply.isDeleted ? 'deleted' : ''].filter(Boolean).join(' ')} id={`community-comment-${reply.id}`} key={reply.id}>
                    <div>
                      <b>{reply.authorName}</b>
                      <span>{formatInstant(reply.createdAt)}</span>
                    </div>
                    <p>{reply.body}</p>
                    {!reply.isDeleted && (platformAdmin || reply.authorId === user?.id) ? (
                      <div className="fp-row-actions">
                        <button type="button" onClick={() => {
                          setReplyToComment(null)
                          setEditingComment(reply)
                          setCommentText(reply.body)
                        }}>수정</button>
                        <button className="danger" type="button" onClick={() => requestDeleteComment(reply)}>삭제</button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )) : <p className="fp-empty-text">댓글이 없습니다.</p>}
            <form className="fp-community-comment-form" onSubmit={requestSaveComment}>
              <label className="fp-field">
                <span>{editingComment ? '댓글 수정' : replyToComment ? `${replyToComment.authorName}님에게 답글` : '댓글'}</span>
                <input data-required-field="community-comment" value={commentText} onChange={(event) => setCommentText(event.target.value)} maxLength={commentMaxLength} />
              </label>
              <div className="fp-row-actions">
                {editingComment || replyToComment ? <button type="button" onClick={() => {
                  setEditingComment(null)
                  setReplyToComment(null)
                  setCommentText('')
                }}>취소</button> : null}
                <button type="submit">{editingComment ? '댓글 저장' : replyToComment ? '답글 등록' : '댓글 등록'}</button>
              </div>
            </form>
          </section> : <p className="fp-community-comments-disabled">댓글을 사용하지 않는 글입니다.</p>}
        </section>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm.onConfirm}
        />
      ) : null}
      {mediaPreview ? <MediaPreviewDialog {...mediaPreview} onClose={() => setMediaPreview(null)} /> : null}
    </section>
  )
}
