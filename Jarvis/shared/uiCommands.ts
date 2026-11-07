import { z } from 'zod'

export const componentNames = [
  'TextPanel',
  'BulletList',
  'DataTable',
  'Chart',
  'Timeline',
  'Checklist',
  'KeyValue',
  'ImageCard',
  'CodeBlock',
  'DynamicUI',
] as const

export const componentNameSchema = z.enum(componentNames)
export type ComponentName = z.infer<typeof componentNameSchema>

const safeText = z.string().trim().min(1).max(4000)
const idSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/)

export const placementSchema = z.union([
  z.object({ dock: z.enum(['left', 'right', 'bottom', 'center']) }).strict(),
  z.object({
    x: z.number().finite().min(0).max(4000),
    y: z.number().finite().min(0).max(4000),
    w: z.number().finite().min(220).max(1200),
    h: z.number().finite().min(120).max(900),
  }).strict(),
])
export type Placement = z.infer<typeof placementSchema>

export const themeTokensSchema = z.object({
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  surface: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  text: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  muted: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
}).strict()
export type ThemeTokens = z.infer<typeof themeTokensSchema>

const propsSchema = z.record(z.string(), z.unknown()).refine(
  (props) => Object.keys(props).length <= 24,
  'Component props are limited to 24 fields',
)
const dynamicNodeSchema: z.ZodType = z.lazy(() => z.object({
  type: z.enum(['section', 'div', 'h1', 'h2', 'h3', 'p', 'span', 'label', 'button', 'input', 'img']),
  text: z.string().max(4000).optional(),
  attrs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  style: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  children: z.array(dynamicNodeSchema).max(40).optional(),
}).strict())
export const dynamicUiPropsSchema = z.object({
  tree: dynamicNodeSchema,
}).strict()
export const imagePropsSchema = z.object({
  url: z.string().max(2048).refine((value) => /^https?:\/\//i.test(value) || /^\/api\/generated-images\/[a-f0-9-]+$/i.test(value), 'Image URL must use HTTP, HTTPS, or a generated image path'),
  alt: z.string().trim().min(1).max(240),
  caption: z.string().trim().max(500).optional(),
}).passthrough()

export const uiCommandSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('openWindow'),
    id: idSchema,
    title: safeText.max(120),
    component: componentNameSchema,
    props: propsSchema,
    placement: placementSchema.optional(),
  }).strict(),
  z.object({
    op: z.literal('updateWindow'),
    id: idSchema,
    title: safeText.max(120).optional(),
    props: propsSchema.optional(),
  }).strict(),
  z.object({ op: z.literal('closeWindow'), id: idSchema }).strict(),
  z.object({ op: z.literal('moveWindow'), id: idSchema, placement: placementSchema }).strict(),
  z.object({ op: z.literal('focusWindow'), id: idSchema }).strict(),
  z.object({ op: z.literal('setLayout'), preset: z.enum(['single', 'split', 'grid']) }).strict(),
  z.object({ op: z.literal('setTheme'), tokens: themeTokensSchema }).strict(),
  z.object({
    op: z.literal('highlight'),
    targetId: idSchema,
    durationMs: z.number().int().min(250).max(15000),
  }).strict(),
  z.object({ op: z.literal('toast'), message: safeText.max(240) }).strict(),
  z.object({ op: z.literal('undo') }).strict(),
])

export type UiCommand = z.infer<typeof uiCommandSchema>
export const uiCommandsSchema = z.array(uiCommandSchema).max(8)

export const swarmResponseSchema = z.object({
  answer: z.string().trim().min(1).max(12000),
  commands: uiCommandsSchema,
  speech: z.string().trim().max(500),
}).strict()
export type SwarmResponse = z.infer<typeof swarmResponseSchema>

export const defaultThemeTokens: ThemeTokens = {
  accent: '#c6f17d',
  surface: '#fffdf7',
  text: '#132d2b',
  muted: '#6c7d79',
}
