// Markdown, plain text and images become small HTML documents, so Chromium prints them all.
import { marked } from "marked"

const BASE_STYLE = `
  html { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif; font-size: 11pt; line-height: 1.5; color: #1f2328; }
  body { margin: 0; }
`

const MARKDOWN_STYLE = `
  h1, h2 { border-bottom: 1px solid #d1d9e0; padding-bottom: 0.3em; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 1.2em 0 0.6em; break-after: avoid; }
  a { color: #0969da; }
  code { font-family: ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace; font-size: 0.9em; background: #f6f8fa; padding: 0.15em 0.35em; border-radius: 4px; }
  pre { background: #f6f8fa; padding: 0.8em 1em; border-radius: 6px; white-space: pre-wrap; overflow-wrap: anywhere; break-inside: avoid; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 0; padding: 0 1em; color: #59636e; border-left: 0.25em solid #d1d9e0; }
  table { border-collapse: collapse; margin: 1em 0; }
  th, td { border: 1px solid #d1d9e0; padding: 0.35em 0.7em; }
  th { background: #f6f8fa; }
  tr { break-inside: avoid; }
  img { max-width: 100%; }
  hr { border: none; border-top: 1px solid #d1d9e0; }
`

export function markdownDocument(markdown: string): string {
  const body = marked.parse(markdown, { gfm: true, async: false })
  return page(`${BASE_STYLE}${MARKDOWN_STYLE}`, body)
}

export function textDocument(text: string): string {
  const style = `pre { margin: 0; font-family: ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace; font-size: 9.5pt; white-space: pre-wrap; overflow-wrap: anywhere; }`
  return page(`${BASE_STYLE}${style}`, `<pre>${escapeHtml(text)}</pre>`)
}

// One image, centred and scaled down to fit the page inside its margins; never scaled up.
export function imageDocument(data: Buffer, mime: string): string {
  const style = `
    html, body { margin: 0; height: 100%; }
    body { display: flex; align-items: center; justify-content: center; overflow: hidden; }
    img { display: block; max-width: 100%; max-height: 100vh; object-fit: contain; }
  `
  return page(style, `<img src="data:${mime};base64,${data.toString("base64")}" alt="">`)
}

export function decodeText(data: Buffer): string {
  return data.toString("utf8").replace(/^\uFEFF/, "")
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

function page(style: string, body: string): string {
  return `<!doctype html>\n<html><head><meta charset="utf-8"><style>${style}</style></head><body>${body}</body></html>\n`
}
