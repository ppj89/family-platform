import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { apiActionMessage } from '../../../shared/api/client'
import { getStoredUser } from '../../../shared/api/auth'
import { ConfirmDialog, ToastMessage } from '../../../shared/components'
import {
  createCommunityComment,
  createCommunityPost,
  deleteCommunityComment,
  deleteCommunityPost,
  getCommunityPost,
  listCommunityPosts,
  updateCommunityComment,
  updateCommunityPost,
} from '../api/community'
import type { CommunityBoardType, CommunityComment, CommunityPost, CommunityPostPayload } from '../types'
import './community-page.css'

type ConfirmState = {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
}

const boardLabels: Record<CommunityBoardType, string> = {
  notice: '공지사항',
  free: '자유게시판',
  inquiry: '문의사항',
}

const boardDescriptions: Record<CommunityBoardType, string> = {
  notice: '가족 플랫폼 공지와 운영 안내를 확인합니다.',
  free: '가족과 자유롭게 이야기를 나누는 게시판입니다.',
  inquiry: '관리자에게 필요한 내용을 문의합니다.',
}

const initialForm = { title: '', body: '' }

function formatInstant(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function canWriteBoard(board: CommunityBoardType, platformAdmin: boolean) {
  return board === 'free' || platformAdmin
}

export default function CommunityPage() {
  const user = useMemo(() => getStoredUser(), [])
  const platformAdmin = Boolean(user?.platformAdmin)
  const formRef = useRef<HTMLFormElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [activeBoard, setActiveBoard] = useState<CommunityBoardType>('notice')
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null)
  const [comments, setComments] = useState<CommunityComment[]>([])
  const [form, setForm] = useState(initialForm)
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null)
  const [commentText, setCommentText] = useState('')
  const [editingComment, setEditingComment] = useState<CommunityComment | null>(null)
  const [loading, setLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const writable = canWriteBoard(activeBoard, platformAdmin)
  const boardTitle = boardLabels[activeBoard]

  async function loadPosts(board = activeBoard) {
    setLoading(true)
    try {
      const items = await listCommunityPosts(board)
      setPosts(items)
    } catch (error) {
      setPosts([])
      setToastMessage(apiActionMessage(error, '게시글을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  async function openPost(post: CommunityPost) {
    setLoading(true)
    try {
      const detail = await getCommunityPost(post.id)
      setSelectedPost(detail.post)
      setComments(detail.comments || [])
      setEditingPost(null)
      setCommentText('')
      setEditingComment(null)
    } catch (error) {
      setToastMessage(apiActionMessage(error, '게시글 상세를 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setSelectedPost(null)
    setComments([])
    setEditingPost(null)
    setEditingComment(null)
    setForm(initialForm)
    void loadPosts(activeBoard)
  }, [activeBoard])

  function focusComposer() {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => titleInputRef.current?.focus(), 250)
  }

  function resetForm() {
    setForm(initialForm)
    setEditingPost(null)
  }

  async function savePost() {
    if (!form.title.trim()) {
      setToastMessage('제목을 입력해주세요.')
      titleInputRef.current?.focus()
      return
    }
    setLoading(true)
    const payload: CommunityPostPayload = {
      boardType: activeBoard,
      familyId: null,
      title: form.title.trim(),
      body: form.body.trim(),
      mediaUrls: editingPost?.mediaUrls || [],
    }
    try {
      const isEditing = Boolean(editingPost)
      const saved = editingPost ? await updateCommunityPost(editingPost.id, payload) : await createCommunityPost(payload)
      resetForm()
      await loadPosts(activeBoard)
      if (selectedPost?.id === saved.id) await openPost(saved)
      setToastMessage(isEditing ? '게시글을 수정했습니다.' : '게시글을 등록했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, '게시글을 저장하지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  function requestSavePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const isEditing = Boolean(editingPost)
    setConfirm({
      title: isEditing ? '수정' : '저장',
      body: isEditing ? '게시글을 수정하시겠습니까?' : '게시글을 등록하시겠습니까?',
      confirmLabel: isEditing ? '수정' : '저장',
      onConfirm: () => {
        setConfirm(null)
        void savePost()
      },
    })
  }

  function startEditPost(post: CommunityPost) {
    setEditingPost(post)
    setForm({ title: post.title, body: post.body || '' })
    focusComposer()
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
          if (selectedPost?.id === post.id) {
            setSelectedPost(null)
            setComments([])
          }
          await loadPosts(activeBoard)
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
    if (!selectedPost || !body) {
      setToastMessage('댓글 내용을 입력해주세요.')
      return
    }
    setLoading(true)
    try {
      const isEditing = Boolean(editingComment)
      if (editingComment) {
        await updateCommunityComment(editingComment.id, body)
        setEditingComment(null)
      } else {
        await createCommunityComment(selectedPost.id, body)
      }
      setCommentText('')
      await openPost(selectedPost)
      setToastMessage(isEditing ? '댓글을 수정했습니다.' : '댓글을 등록했습니다.')
    } catch (error) {
      setToastMessage(apiActionMessage(error, '댓글을 저장하지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  function requestSaveComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const isEditing = Boolean(editingComment)
    setConfirm({
      title: isEditing ? '수정' : '저장',
      body: isEditing ? '댓글을 수정하시겠습니까?' : '댓글을 등록하시겠습니까?',
      confirmLabel: isEditing ? '수정' : '저장',
      onConfirm: () => {
        setConfirm(null)
        void saveComment()
      },
    })
  }

  function requestDeleteComment(comment: CommunityComment) {
    if (!selectedPost) return
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
          await openPost(selectedPost)
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
          {(Object.keys(boardLabels) as CommunityBoardType[]).map((board) => (
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

      <div className="fp-community-layout">
        <section className="fp-card fp-community-list">
          <header>
            <div>
              <h3>{boardTitle}</h3>
              <p>{boardDescriptions[activeBoard]}</p>
            </div>
            <div className="fp-community-list-actions">
              <span>{posts.length}건</span>
              <button className="fp-button fp-button-primary" type="button" onClick={focusComposer} disabled={!writable}>
                글쓰기
              </button>
            </div>
          </header>

          <div className="fp-community-posts">
            {posts.length ? posts.map((post) => (
              <article className={selectedPost?.id === post.id ? 'active' : ''} key={post.id}>
                <button type="button" onClick={() => openPost(post)}>
                  <strong>{post.title}</strong>
                  <span>{post.authorName} · {formatInstant(post.createdAt)} · 조회 {post.viewCount}</span>
                  <p>{post.body || '내용 없음'}</p>
                </button>
                <div className="fp-row-actions">
                  <button type="button" onClick={() => startEditPost(post)}>수정</button>
                  <button className="danger" type="button" onClick={() => requestDeletePost(post)}>삭제</button>
                </div>
              </article>
            )) : <p className="fp-empty-text">등록된 게시글이 없습니다.</p>}
          </div>
        </section>

        <aside className="fp-community-side">
          <form className="fp-card fp-community-form" ref={formRef} onSubmit={requestSavePost}>
            <header>
              <h3>{editingPost ? '게시글 수정' : '새 글 작성'}</h3>
              {editingPost ? <button className="fp-button fp-button-muted" type="button" onClick={resetForm}>취소</button> : null}
            </header>
            {!writable ? <p className="fp-community-lock">이 게시판은 관리자만 작성할 수 있습니다.</p> : null}
            <label className="fp-field">
              <span>제목 <em className="fp-required-mark">*</em></span>
              <input
                ref={titleInputRef}
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                disabled={!writable}
              />
            </label>
            <label className="fp-field">
              <span>내용</span>
              <textarea
                value={form.body}
                onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
                disabled={!writable}
              />
            </label>
            <button className="fp-button fp-button-primary" type="submit" disabled={!writable}>
              {editingPost ? '저장' : '등록'}
            </button>
          </form>

          <section className="fp-card fp-community-detail">
            {selectedPost ? (
              <>
                <header>
                  <button className="fp-button fp-button-muted" type="button" onClick={() => setSelectedPost(null)}>목록</button>
                  <div className="fp-row-actions">
                    <button type="button" onClick={() => startEditPost(selectedPost)}>수정</button>
                    <button className="danger" type="button" onClick={() => requestDeletePost(selectedPost)}>삭제</button>
                  </div>
                </header>
                <article className="fp-community-detail-article">
                  <h3>{selectedPost.title}</h3>
                  <span>{selectedPost.authorName} · {formatInstant(selectedPost.createdAt)} · 조회 {selectedPost.viewCount}</span>
                  <p>{selectedPost.body || '내용 없음'}</p>
                </article>
                <section className="fp-community-comments">
                  <strong>댓글 {comments.length}</strong>
                  {comments.length ? comments.map((comment) => (
                    <div className="fp-community-comment" key={comment.id}>
                      <div>
                        <b>{comment.authorName}</b>
                        <span>{formatInstant(comment.createdAt)}</span>
                      </div>
                      <p>{comment.body}</p>
                      <div className="fp-row-actions">
                        <button type="button" onClick={() => {
                          setEditingComment(comment)
                          setCommentText(comment.body)
                        }}>수정</button>
                        <button className="danger" type="button" onClick={() => requestDeleteComment(comment)}>삭제</button>
                      </div>
                    </div>
                  )) : <p className="fp-empty-text">댓글이 없습니다.</p>}
                  <form className="fp-community-comment-form" onSubmit={requestSaveComment}>
                    <label className="fp-field">
                      <span>댓글</span>
                      <input value={commentText} onChange={(event) => setCommentText(event.target.value)} />
                    </label>
                    <div className="fp-row-actions">
                      {editingComment ? <button type="button" onClick={() => {
                        setEditingComment(null)
                        setCommentText('')
                      }}>취소</button> : null}
                      <button type="submit">{editingComment ? '댓글 저장' : '댓글 등록'}</button>
                    </div>
                  </form>
                </section>
              </>
            ) : <p className="fp-empty-text">게시글을 선택하면 상세와 댓글이 보입니다.</p>}
          </section>
        </aside>
      </div>

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
    </section>
  )
}
