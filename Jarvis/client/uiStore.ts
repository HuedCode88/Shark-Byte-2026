import { create } from 'zustand'
import {
  defaultThemeTokens,
  type ComponentName,
  type Placement,
  type ThemeTokens,
  type UiCommand,
  uiCommandSchema,
} from '../shared/uiCommands'

export type UiWindow = {
  id: string
  title: string
  component: ComponentName
  props: Record<string, unknown>
  placement: Placement
}

export type UiSnapshot = {
  windows: Array<Pick<UiWindow, 'id' | 'title' | 'component' | 'placement'> & { propsSummary: string[] }>
  layout: 'single' | 'split' | 'grid'
  themeTokens: ThemeTokens
  focusedWindowId: string | null
  viewport: { width: number; height: number }
}

type State = {
  windows: UiWindow[]
  layout: 'single' | 'split' | 'grid'
  theme: ThemeTokens
  focusedWindowId: string | null
  undoStack: Array<Pick<State, 'windows' | 'layout' | 'theme' | 'focusedWindowId'>>
  userRevision: Record<string, number>
  toast: string | null
  applyCommands: (commands: UiCommand[]) => void
  updateWindowLocally: (id: string, patch: Partial<UiWindow>) => void
  closeWindowLocally: (id: string) => void
  undo: () => void
  clearToast: () => void
  getUiSnapshot: () => UiSnapshot
}

const cloneState = (state: State) => ({
  windows: structuredClone(state.windows),
  layout: state.layout,
  theme: { ...state.theme },
  focusedWindowId: state.focusedWindowId,
})

const placementFor = (index: number, layout: State['layout']): Placement => {
  if (layout === 'single') return { dock: 'center' }
  if (layout === 'split') return { dock: index % 2 === 0 ? 'left' : 'right' }
  return { x: 36 + (index % 2) * 48, y: 80 + Math.floor(index / 2) * 38, w: 420, h: 280 }
}

export const useUiStore = create<State>((set, get) => ({
  windows: [],
  layout: 'single',
  theme: defaultThemeTokens,
  focusedWindowId: null,
  undoStack: [],
  userRevision: {},
  toast: null,
  applyCommands: (commands) => {
    const validCommands = commands
      .slice(0, 8)
      .flatMap((command) => {
        const valid = uiCommandSchema.safeParse(command)
        if (!valid.success) {
          console.warn('Rejected invalid UI command', valid.error.flatten())
          return []
        }
        return [valid.data]
      })
    if (!validCommands.length && commands.length) {
      return
    }
    set((state) => {
      const next = { ...state, undoStack: [...state.undoStack, cloneState(state)].slice(-20) }
      for (const command of validCommands) {
        if (command.op === 'undo') {
          const previous = next.undoStack.pop()
          if (previous) Object.assign(next, previous)
          continue
        }
        if ('id' in command && next.userRevision[command.id]) continue
        if (command.op === 'openWindow') {
          const existing = next.windows.find((window) => window.id === command.id)
          if (existing) {
            Object.assign(existing, {
              title: command.title,
              component: command.component,
              props: command.props,
              placement: command.placement ?? existing.placement,
            })
          } else {
            if (next.windows.length >= 4) continue
            next.windows.push({ ...command, placement: command.placement ?? placementFor(next.windows.length, next.layout) })
          }
          next.focusedWindowId = command.id
        } else if (command.op === 'updateWindow') {
          const window = next.windows.find((item) => item.id === command.id)
          if (window) Object.assign(window, { title: command.title ?? window.title, props: command.props ?? window.props })
        } else if (command.op === 'closeWindow') {
          next.windows = next.windows.filter((item) => item.id !== command.id)
          if (next.focusedWindowId === command.id) next.focusedWindowId = next.windows.at(-1)?.id ?? null
        } else if (command.op === 'moveWindow') {
          const window = next.windows.find((item) => item.id === command.id)
          if (window) window.placement = command.placement
        } else if (command.op === 'focusWindow' && next.windows.some((item) => item.id === command.id)) {
          next.focusedWindowId = command.id
        } else if (command.op === 'setLayout') {
          next.layout = command.preset
          next.windows = next.windows.map((window, index) => ({ ...window, placement: placementFor(index, command.preset) }))
        } else if (command.op === 'setTheme') {
          next.theme = { ...next.theme, ...command.tokens }
        } else if (command.op === 'toast') {
          next.toast = command.message
        }
      }
      return next
    })
  },
  updateWindowLocally: (id, patch) => set((state) => ({
    ...state,
    windows: state.windows.map((window) => window.id === id ? { ...window, ...patch } : window),
    userRevision: { ...state.userRevision, [id]: (state.userRevision[id] ?? 0) + 1 },
  })),
  closeWindowLocally: (id) => set((state) => ({
    ...state,
    windows: state.windows.filter((window) => window.id !== id),
    userRevision: { ...state.userRevision, [id]: (state.userRevision[id] ?? 0) + 1 },
    focusedWindowId: state.focusedWindowId === id ? null : state.focusedWindowId,
  })),
  undo: () => set((state) => {
    const previous = state.undoStack.at(-1)
    return previous ? { ...state, ...previous, undoStack: state.undoStack.slice(0, -1) } : state
  }),
  clearToast: () => set({ toast: null }),
  getUiSnapshot: () => {
    const state = get()
    return {
      windows: state.windows.map(({ id, title, component, props, placement }) => ({
        id, title, component, placement, propsSummary: Object.keys(props).slice(0, 8),
      })),
      layout: state.layout,
      themeTokens: state.theme,
      focusedWindowId: state.focusedWindowId,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }
  },
}))
