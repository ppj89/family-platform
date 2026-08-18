import { useEffect, useMemo, useState } from 'react'
import { HiOutlineChevronLeft, HiOutlineChevronRight, HiOutlineX } from 'react-icons/hi'

export type MediaPreviewItem = {
  file?: File | null
  url?: string | null
  title?: string
}

type MediaPreviewDialogProps = MediaPreviewItem & {
  items?: MediaPreviewItem[]
  initialIndex?: number
  onClose: () => void
}

function isVideo(source: string, file?: File | null) {
  return Boolean(file?.type.startsWith('video/')) || /\.(mp4|mov|webm|m4v|avi|mkv)(?:[?#]|$)/i.test(source)
}

export function MediaPreviewDialog({ file = null, url = null, title = '미디어 미리보기', items, initialIndex = 0, onClose }: MediaPreviewDialogProps) {
  const previewItems = useMemo(() => {
    const availableItems = (items?.length ? items : [{ file, url, title }]).filter((item) => item.file || item.url)
    return availableItems.length ? availableItems : [{ file, url, title }]
  }, [file, items, title, url])
  const [activeIndex, setActiveIndex] = useState(Math.min(Math.max(initialIndex, 0), previewItems.length - 1))
  const activeItem = previewItems[activeIndex] || previewItems[0]
  const activeFile = activeItem.file || null
  const activeURL = activeItem.url || null
  const canNavigate = previewItems.length > 1
  const source = useMemo(() => activeFile ? URL.createObjectURL(activeFile) : (activeURL || ''), [activeFile, activeURL])
  const video = isVideo(source, activeFile)
  const mediaLabel = video ? '영상' : '사진'

  useEffect(() => {
    setActiveIndex(Math.min(Math.max(initialIndex, 0), previewItems.length - 1))
  }, [initialIndex, previewItems.length])

  useEffect(() => {
    return () => {
      if (activeFile && source) URL.revokeObjectURL(source)
    }
  }, [activeFile, source])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    document.documentElement.classList.add('fp-media-preview-open')
    document.body.classList.add('fp-media-preview-open')
    return () => {
      document.documentElement.classList.remove('fp-media-preview-open')
      document.body.classList.remove('fp-media-preview-open')
    }
  }, [])

  if (!source) return null

  return (
    <div className="fp-media-preview-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="fp-media-preview-dialog" role="dialog" aria-modal="true" aria-label={mediaLabel}>
        <header>
          <h2>{mediaLabel}</h2>
          <button type="button" aria-label="닫기" onClick={onClose}>
            <HiOutlineX aria-hidden="true" />
          </button>
        </header>
        <div className="fp-media-preview-content">
          {video ? <video src={source} controls autoPlay playsInline preload="metadata">영상을 재생할 수 없습니다.</video> : <img src={source} alt={mediaLabel} />}
        </div>
        {canNavigate ? (
          <nav className="fp-media-preview-navigation" aria-label="첨부파일 탐색">
            <button type="button" onClick={() => setActiveIndex((current) => Math.max(0, current - 1))} disabled={activeIndex === 0}>
              <HiOutlineChevronLeft aria-hidden="true" /> 이전
            </button>
            <span>{activeIndex + 1} / {previewItems.length}</span>
            <button type="button" onClick={() => setActiveIndex((current) => Math.min(previewItems.length - 1, current + 1))} disabled={activeIndex === previewItems.length - 1}>
              다음 <HiOutlineChevronRight aria-hidden="true" />
            </button>
          </nav>
        ) : null}
      </section>
    </div>
  )
}
