import { Component, createElement, useEffect, useRef, useState, type ErrorInfo, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { componentRegistry } from './componentRegistry'
import { useUiStore, type UiWindow } from './uiStore'

class WindowErrorBoundary extends Component<{ children: ReactNode; windowId: string; title: string; component: string }, { failed: boolean; message: string }> {
  state = { failed: false, message: '' }

  static getDerivedStateFromError(error: Error) {
    return { failed: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Generated window render failed', { id: this.props.windowId, component: this.props.component, error, info })
  }

  render() {
    if (this.state.failed) {
      return <div className="panel-content"><strong>Jarvis could not render this window.</strong><p>Component: {this.props.component}</p><p>{this.state.message || 'The generated UI payload was invalid.'}</p></div>
    }
    return this.props.children
  }
}

function FloatingWindow({ window }: { window: UiWindow }) {
  const closeWindowLocally = useUiStore((state) => state.closeWindowLocally)
  const updateWindowLocally = useUiStore((state) => state.updateWindowLocally)
  const focus = useUiStore((state) => state.applyCommands)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const Component = componentRegistry[window.component]

  useEffect(() => {
    if ('x' in window.placement) setPosition({ x: window.placement.x, y: window.placement.y })
  }, [window.placement])

  const onPointerMove = (event: PointerEvent) => {
    if (!dragStart.current) return
    const next = { x: Math.max(12, position.x + event.clientX - dragStart.current.x), y: Math.max(12, position.y + event.clientY - dragStart.current.y) }
    setPosition(next)
  }
  const stopDragging = () => {
    if (dragStart.current) updateWindowLocally(window.id, { placement: { x: position.x, y: position.y, w: 'w' in window.placement ? window.placement.w : 420, h: 'h' in window.placement ? window.placement.h : 280 } })
    dragStart.current = null
    globalThis.window.removeEventListener('pointermove', onPointerMove)
    globalThis.window.removeEventListener('pointerup', stopDragging)
  }
  const startDragging = (event: ReactPointerEvent) => {
    if (!('x' in window.placement)) return
    dragStart.current = { x: event.clientX, y: event.clientY }
    globalThis.window.addEventListener('pointermove', onPointerMove)
    globalThis.window.addEventListener('pointerup', stopDragging)
  }
  const placement = 'x' in window.placement ? { left: position.x, top: position.y, width: window.placement.w, height: window.placement.h } : {}

  try {
    return <article className={`floating-window ${'dock' in window.placement ? `dock-${window.placement.dock}` : ''}`} style={placement} data-ui-id={window.id} onPointerDown={() => focus([{ op: 'focusWindow', id: window.id }])}>
      <header onPointerDown={startDragging}><strong>{window.title}</strong><button className="window-close" onClick={() => closeWindowLocally(window.id)} aria-label={`Close ${window.title}`}>×</button></header>
      <WindowErrorBoundary windowId={window.id} title={window.title} component={window.component}>
        {Component ? createElement(Component.render, window.props) : <div className="panel-content">Unsupported UI component: {window.component}</div>}
      </WindowErrorBoundary>
    </article>
  } catch (error) {
    console.error('Window render failed', { id: window.id, component: window.component, error })
    return <article className="floating-window dock-center" data-ui-id={window.id}><header><strong>{window.title || 'Jarvis visual result'}</strong></header><div className="panel-content">Jarvis received an invalid visual command.</div></article>
  }
}

export function WindowManager() {
  const windows = useUiStore((state) => state.windows)
  const layout = useUiStore((state) => state.layout)
  const toast = useUiStore((state) => state.toast)
  const clearToast = useUiStore((state) => state.clearToast)
  useEffect(() => { if (toast) { const timer = window.setTimeout(clearToast, 3500); return () => window.clearTimeout(timer) } }, [toast, clearToast])
  const stageHeight = Math.max(580, Math.ceil(windows.length / 2) * 320 + 80)
  return <section className={`window-stage layout-${layout}`} style={{ minHeight: stageHeight }} aria-label="Generative UI workspace">
    {windows.map((window) => <FloatingWindow key={window.id} window={window} />)}
    {toast && <div className="ui-toast" role="status">{toast}</div>}
  </section>
}
