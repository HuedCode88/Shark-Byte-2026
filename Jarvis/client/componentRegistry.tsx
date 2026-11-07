import { createElement, type ReactNode } from 'react'
import { z } from 'zod'
import { dynamicUiPropsSchema, type ComponentName } from '../shared/uiCommands'

const textProps = z.object({ text: z.string().max(4000), eyebrow: z.string().max(80).optional() }).passthrough()
const tableProps = z.object({
  columns: z.array(z.string().max(80)).max(12),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))).max(100),
}).passthrough()
const chartProps = z.object({
  series: z.array(z.object({ label: z.string().max(80), value: z.number().finite().min(-1000000).max(1000000) })).max(30),
  unit: z.string().max(20).optional(),
}).passthrough()
const imageProps = z.object({
  url: z.string().max(2048).refine((value) => /^https?:\/\//i.test(value) || /^\/api\/generated-images\/[a-f0-9-]+$/i.test(value)),
  alt: z.string().min(1).max(240),
  caption: z.string().max(500).optional(),
}).passthrough()

const TextPanel = (props: Record<string, unknown>) => (
  <div className="panel-content">{props.eyebrow ? <span className="panel-eyebrow">{String(props.eyebrow)}</span> : null}<p>{String(props.text ?? '')}</p></div>
)
const DataTable = (props: Record<string, unknown>) => {
  const parsed = tableProps.safeParse(props)
  if (!parsed.success) return <div className="panel-content">Invalid table data</div>
  return <div className="panel-content table-wrap"><table><thead><tr>{parsed.data.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{parsed.data.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{String(cell)}</td>)}</tr>)}</tbody></table></div>
}
const Chart = (props: Record<string, unknown>) => {
  const parsed = chartProps.safeParse(props)
  if (!parsed.success) return <div className="panel-content">Invalid chart data</div>
  const max = Math.max(...parsed.data.series.map((item) => Math.abs(item.value)), 1)
  return <div className="panel-content chart">{parsed.data.series.map((item) => <div className="bar-row" key={item.label}><span>{item.label}</span><div className="bar-track"><i style={{ width: `${Math.min(100, Math.abs(item.value) / max * 100)}%` }} /></div><strong>{item.value}{parsed.data.unit ?? ''}</strong></div>)}</div>
}
const ImageCard = (props: Record<string, unknown>) => {
  const parsed = imageProps.safeParse(props)
  if (!parsed.success) return <div className="panel-content">Invalid image data</div>
  return <figure className="image-card"><img src={parsed.data.url} alt={parsed.data.alt} loading="lazy" referrerPolicy="no-referrer" /><figcaption>{parsed.data.caption ?? parsed.data.alt}</figcaption></figure>
}
const dynamicTypes = new Set(['section', 'div', 'h1', 'h2', 'h3', 'p', 'span', 'label', 'button', 'input', 'img'])
const DynamicUI = (props: Record<string, unknown>) => {
  const parsed = dynamicUiPropsSchema.safeParse(props)
  if (!parsed.success) return <div className="panel-content">Invalid dynamic UI data</div>
  const renderNode = (node: Record<string, unknown>, key: string): ReactNode => {
    if (!dynamicTypes.has(String(node.type))) return null
    const attrs = node.attrs && typeof node.attrs === 'object' ? node.attrs as Record<string, string | number | boolean> : {}
    const safeAttrs = Object.fromEntries(Object.entries(attrs)
      .filter(([name]) => ['alt', 'placeholder', 'type', 'name', 'value', 'id', 'for'].includes(name))
      .map(([name, value]) => [name === 'for' ? 'htmlFor' : name, value]))
    const style = node.style && typeof node.style === 'object' ? node.style as Record<string, string | number> : {}
    const children: ReactNode[] = Array.isArray(node.children) ? node.children.map((child, index) => renderNode(child as Record<string, unknown>, `${key}-${index}`)) : []
    const elementProps = { key, ...safeAttrs, style }
    if (node.type === 'input' || node.type === 'img') return createElement(String(node.type), elementProps)
    const text = typeof node.text === 'string' ? node.text : ''
    return createElement(String(node.type), elementProps, text ? [text, ...children] : children)
  }
  try {
    return <div className="dynamic-ui">{renderNode(parsed.data.tree as Record<string, unknown>, 'root')}</div>
  } catch (error) {
    console.error('Dynamic UI render failed', error)
    return <div className="panel-content">Jarvis received an invalid interface from the UI agent.</div>
  }
}

export const componentRegistry: Record<ComponentName, { render: (props: Record<string, unknown>) => ReactNode; propsSchema: z.ZodType }> = {
  TextPanel: { render: TextPanel, propsSchema: textProps },
  DataTable: { render: DataTable, propsSchema: tableProps },
  Chart: { render: Chart, propsSchema: chartProps },
  BulletList: { render: TextPanel, propsSchema: z.record(z.string(), z.unknown()) },
  Timeline: { render: TextPanel, propsSchema: z.record(z.string(), z.unknown()) },
  Checklist: { render: TextPanel, propsSchema: z.record(z.string(), z.unknown()) },
  KeyValue: { render: TextPanel, propsSchema: z.record(z.string(), z.unknown()) },
  ImageCard: { render: ImageCard, propsSchema: imageProps },
  CodeBlock: { render: TextPanel, propsSchema: z.record(z.string(), z.unknown()) },
  DynamicUI: { render: DynamicUI, propsSchema: dynamicUiPropsSchema },
}
