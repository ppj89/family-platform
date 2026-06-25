import { FormEvent, useEffect, useMemo, useState } from 'react'
import { apiActionMessage } from '../../../shared/api/client'
import { getStoredUser } from '../../../shared/api/auth'
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog'
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

const boardLabels: Record<CommunityBoardType, string> = {
  notice: '공지사항',
  free: '자유게시판',
  inquiry: '문의사항',
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
  const [activeBoard, setActiveBoard] = useState<CommunityBoardType>('free')
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null)
  const [comments, setComments] = useState<CommunityComment[]>([])
  const [form, setForm] = useState(initialForm)
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null)
  const [composingPost, setComposingPost] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [editingComment, setEditingComment] = useState<CommunityComment | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [confirm, setConfirm] = useState<{ title: string; body: string; danger?: boolean; onConfirm: () => void } | null>(null)

  const writable = canWriteBoard(activeBoard, platformAdmin)

  async function loadPosts(board = activeBoard) {
    setLoading(true)
    setMessage('')
    try {
      const items = await listCommunityPosts(board)
      setPosts(items)
    } catch (error) {
      setPosts([])
      setMessage(apiActionMessage(error, '게시글을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  async function openPost(post: CommunityPost) {
    setLoading(true)
    setMessage('')
    try {
      const detail = await getCommunityPost(post.id)
      setSelectedPost(detail.post)
      setComments(detail.comments || [])
      setEditingPost(null)
      setCommentText('')
      setEditingComment(null)
    } catch (error) {
      setMessage(apiActionMessage(error, '게시글 상세를 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setSelectedPost(null)
    setComments([])
    setEditingPost(null)
    setEditingComment(null)
    setComposingPost(false)
    setForm(initialForm)
    loadPosts(activeBoard)
  }, [activeBoard])

  function resetForm() {
    setForm(initialForm)
    setEditingPost(null)
    setComposingPost(false)
  }

  async function savePost() {
    if (!form.title.trim()) {
      setMessage('제목을 입력해주세요.')
      return
    }
    setLoading(true)
    setMessage('')
    const payload: CommunityPostPayload = {
      boardType: activeBoard,
      familyId: null,
      title: form.title.trim(),
      body: form.body.trim(),
      mediaUrls: editingPost?.mediaUrls || [],
    }
    try {
      const saved = editingPost ? await updateCommunityPost(editingPost.id, payload) : await createCommunityPost(payload)
      resetForm()
      await loadPosts(activeBoard)
      if (selectedPost?.id === saved.id) await openPost(saved)
      setMessage(editingPost ? '게시글을 수정했습니다.' : '게시글을 등록했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, '게시글을 저장하지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  function requestSavePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setConfirm({
      title: editingPost ? '게시글 수정' : '게시글 등록',
      body: editingPost ? '게시글을 수정할까요?' : '게시글을 등록할까요?',
      onConfirm: () => {
        setConfirm(null)
        savePost()
      },
    })
  }

  function startEditPost(post: CommunityPost) {
    setEditingPost(post)
    setComposingPost(true)
    setForm({ title: post.title, body: post.body || '' })
  }

  function startWritePost() {
    setSelectedPost(null)
    setComments([])
    setEditingPost(null)
    setEditingComment(null)
    setCommentText('')
    setForm(initialForm)
    setComposingPost(true)
  }

  function requestDeletePost(post: CommunityPost) {
    setConfirm({
      title: '게시글 삭제',
      body: '게시글과 댓글을 삭제할까요?',
      danger: true,
      onConfirm: async () => {
        setConfirm(null)
        setLoading(true)
        setMessage('')
        try {
          await deleteCommunityPost(post.id)
          if (selectedPost?.id === post.id) {
            setSelectedPost(null)
            setComments([])
          }
          await loadPosts(activeBoard)
          setMessage('게시글을 삭제했습니다.')
        } catch (error) {
          setMessage(apiActionMessage(error, '게시글을 삭제하지 못했습니다.'))
        } finally {
          setLoading(false)
        }
      },
    })
  }

  async function saveComment() {
    const body = commentText.trim()
    if (!selectedPost || !body) {
      setMessage('댓글 내용을 입력해주세요.')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      if (editingComment) {
        await updateCommunityComment(editingComment.id, body)
        setEditingComment(null)
      } else {
        await createCommunityComment(selectedPost.id, body)
      }
      setCommentText('')
      await openPost(selectedPost)
      setMessage(editingComment ? '댓글을 수정했습니다.' : '댓글을 등록했습니다.')
    } catch (error) {
      setMessage(apiActionMessage(error, '댓글을 저장하지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  function requestSaveComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setConfirm({
      title: editingComment ? '댓글 수정' : '댓글 등록',
      body: editingComment ? '댓글을 수정할까요?' : '댓글을 등록할까요?',
      onConfirm: () => {
        setConfirm(null)
        saveComment()
      },
    })
  }

  function requestDeleteComment(comment: CommunityComment) {
    if (!selectedPost) return
    setConfirm({
      title: '댓글 삭제',
      body: '댓글을 삭제할까요?',
      danger: true,
      onConfirm: async () => {
        setConfirm(null)
        setLoading(true)
        setMessage('')
        try {
          await deleteCommunityComment(comment.id)
          await openPost(selectedPost)
          setMessage('댓글을 삭제했습니다.')
        } catch (error) {
          setMessage(apiActionMessage(error, '댓글을 삭제하지 못했습니다.'))
        } finally {
          setLoading(false)
        }
      },
    })
  }

  return (
    <section className="fp-community">
      {loading ? <div className="fp-loading-blocker">처리 중</div> : null}
      <header className="fp-community-header fp-card">
        <div>
          <h2>커뮤니티</h2>
          <p>공지, 자유글, 문의를 게시판별로 관리합니다.</p>
        </div>
        <div className="fp-community-tabs" role="tablist" aria-label="커뮤니티 게시판">
          {(Object.keys(boardLabels) as CommunityBoardType[]).map((board) => (
            <button
              className={activeBoard === board ? 'active' : ''}
              key={board}
              type="button"
              onClick={() => setActiveBoard(board)}
            >
              {boardLabels[board]}
            </button>
          ))}
        </div>
      </header>

      {message ? <p className="fp-message">{message}</p> : null}

      <div className="fp-community-layout">
        <section className="fp-card fp-community-list">
          <header>
            <div>
              <h3>{boardLabels[activeBoard]}</h3>
              <span>{posts.length}건</span>
            </div>
            {writable ? (
              <button className="fp-button fp-button-primary" type="button" onClick={startWritePost}>
                글 작성
              </button>
            ) : null}
          </header>
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
        </section>

        <aside className="fp-community-side">
          {composingPost ? (
            <form className="fp-card fp-community-form" onSubmit={requestSavePost}>
              <header>
                <h3>{editingPost ? '게시글 수정' : '글 작성'}</h3>
                <button className="fp-button fp-button-muted" type="button" onClick={resetForm}>취소</button>
              </header>
              {!writable ? <p className="fp-empty-text">이 게시판은 관리자만 작성할 수 있습니다.</p> : null}
              <label className="fp-field">
                제목 *
                <input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} disabled={!writable} />
              </label>
              <label className="fp-field">
                내용
                <textarea value={form.body} onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))} disabled={!writable} />
              </label>
              <button className="fp-button fp-button-primary" type="submit" disabled={!writable}>{editingPost ? '저장' : '등록'}</button>
            </form>
          ) : null}

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
                <article>
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
                      댓글
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
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm.onConfirm}
        />
      ) : null}
    </section>
  )
}
