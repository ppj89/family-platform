import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

// Shared drag-handle list reordering, driven entirely by Pointer Events
// (works for mouse and touch alike, so it doesn't need a separate native
// HTML5 drag-and-drop path). Spread `getHandleProps(key)` on the dedicated
// drag-handle element that starts a drag (e.g. an order badge or a ⋮⋮
// button) — the rest of the row stays a normal tap target. Spread
// `getRowProps(key)` on each row so drags can hit-test which row the
// pointer is currently over.
const DRAG_KEY_ATTR = 'data-drag-key'

interface UseDragReorderOptions<T> {
  items: T[]
  getKey: (item: T) => string
  onReorder: (nextItems: T[]) => void
  enabled?: boolean
  // Optional scrollable ancestor (e.g. a dialog body) to auto-scroll while
  // dragging near its edge, instead of the window. Falls back to the
  // window when this returns null or isn't scrollable.
  getScrollContainer?: () => HTMLElement | null
}

export function useDragReorder<T>({ items, getKey, onReorder, enabled = true, getScrollContainer }: UseDragReorderOptions<T>) {
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const pointerDraggingKey = useRef<string | null>(null)
  const pointerPending = useRef<{ key: string; x: number; y: number } | null>(null)
  const autoScrollTimer = useRef<number | null>(null)
  const autoScrollStep = useRef(0)
  const itemsRef = useRef(items)
  itemsRef.current = items

  function moveToTarget(sourceKey: string, targetKey: string) {
    const list = itemsRef.current
    const sourceIndex = list.findIndex((item) => getKey(item) === sourceKey)
    const targetIndex = list.findIndex((item) => getKey(item) === targetKey)
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return
    const next = [...list]
    const [moved] = next.splice(sourceIndex, 1)
    next.splice(targetIndex, 0, moved)
    onReorder(next)
  }

  function scrollBy(top: number) {
    const container = getScrollContainer?.()
    if (container && container.scrollHeight > container.clientHeight) {
      container.scrollBy({ top, behavior: 'auto' })
      return
    }
    window.scrollBy({ top, behavior: 'auto' })
  }

  function stopAutoScroll() {
    if (autoScrollTimer.current !== null) {
      window.clearInterval(autoScrollTimer.current)
      autoScrollTimer.current = null
    }
    autoScrollStep.current = 0
  }

  function startAutoScroll(step: number) {
    autoScrollStep.current = step
    scrollBy(step)
    if (autoScrollTimer.current !== null) return
    autoScrollTimer.current = window.setInterval(() => {
      if (autoScrollStep.current) scrollBy(autoScrollStep.current)
    }, 45)
  }

  function scrollViewport(clientY: number) {
    const edgeSize = 110
    const maxStep = 28
    const container = getScrollContainer?.()
    if (container && container.scrollHeight > container.clientHeight) {
      const rect = container.getBoundingClientRect()
      if (clientY < rect.top + edgeSize) {
        startAutoScroll(-Math.max(10, maxStep * (1 - (clientY - rect.top) / edgeSize)))
        return
      }
      if (clientY > rect.bottom - edgeSize) {
        startAutoScroll(Math.max(10, maxStep * (1 - (rect.bottom - clientY) / edgeSize)))
        return
      }
      stopAutoScroll()
      return
    }
    if (clientY < edgeSize) {
      startAutoScroll(-Math.max(10, maxStep * (1 - clientY / edgeSize)))
      return
    }
    if (clientY > window.innerHeight - edgeSize) {
      const distance = window.innerHeight - clientY
      startAutoScroll(Math.max(10, maxStep * (1 - distance / edgeSize)))
      return
    }
    stopAutoScroll()
  }

  function keyFromPoint(x: number, y: number) {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>(`[${DRAG_KEY_ATTR}]`)
    return target?.getAttribute(DRAG_KEY_ATTR) || null
  }

  function end() {
    stopAutoScroll()
    pointerPending.current = null
    pointerDraggingKey.current = null
    setDraggingKey(null)
    setDragOverKey(null)
  }

  function getHandleProps(key: string) {
    return {
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        if (!enabled) return
        event.preventDefault()
        event.stopPropagation()
        pointerPending.current = { key, x: event.clientX, y: event.clientY }
        event.currentTarget.setPointerCapture(event.pointerId)
      },
      onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
        let sourceKey = pointerDraggingKey.current
        const pending = pointerPending.current
        if (!sourceKey && pending) {
          const distance = Math.hypot(event.clientX - pending.x, event.clientY - pending.y)
          if (distance < 8) return
          sourceKey = pending.key
          pointerDraggingKey.current = sourceKey
          setDraggingKey(sourceKey)
        }
        if (!sourceKey) return
        event.preventDefault()
        event.stopPropagation()
        scrollViewport(event.clientY)
        const targetKey = keyFromPoint(event.clientX, event.clientY)
        if (!targetKey || targetKey === sourceKey) return
        setDragOverKey(targetKey)
        moveToTarget(sourceKey, targetKey)
      },
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
        event.stopPropagation()
        end()
      },
      onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
        event.stopPropagation()
        end()
      },
    }
  }

  function getRowProps(key: string) {
    return {
      [DRAG_KEY_ATTR]: key,
    }
  }

  return { draggingKey, dragOverKey, getHandleProps, getRowProps, endDrag: end }
}
