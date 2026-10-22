// Working out what an upload is: from the `type` the client names, else the file name, else
// the Content-Type, else the first bytes of the file.
import path from "node:path"
import { unsupported } from "./errors.js"

export const FORMATS = ["html", "url", "markdown", "text", "image", "pdf"] as const
export type Format = (typeof FORMATS)[number]

// Names a client may pass as `type`.
const TYPE_NAMES: Record<string, Format> = {
  html: "html",
  htm: "html",
  markdown: "markdown",
  md: "markdown",
  text: "text",
  txt: "text",
  image: "image",
  pdf: "pdf",
}

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
}

const EXTENSIONS: Record<string, Format> = {
  ".html": "html",
  ".htm": "html",
  ".xhtml": "html",
  ".md": "markdown",
  ".markdown": "markdown",
  ".txt": "text",
  ".log": "text",
  ".pdf": "pdf",
  ...Object.fromEntries(Object.keys(IMAGE_MIME).map((ext) => [ext, "image" as const])),
}

const MIME_TYPES: Record<string, Format> = {
  "text/html": "html",
  "application/xhtml+xml": "html",
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "text/plain": "text",
  "application/pdf": "pdf",
}

export interface Detected {
  format: Format
  // The image's MIME type, for embedding it; set only for images.
  mime?: string
}

export interface DetectHints {
  type?: string
  filename?: string
  contentType?: string
}

export function parseType(type: string): Format {
  const format = TYPE_NAMES[type.trim().toLowerCase()]
  if (!format) throw unsupported(`Unknown type "${type}". Use one of: ${Object.keys(TYPE_NAMES).join(", ")}`)
  return format
}

export function detectFormat(data: Buffer, hints: DetectHints = {}): Detected {
  const ext = hints.filename ? path.extname(hints.filename).toLowerCase() : ""
  const mime = hints.contentType?.split(";")[0].trim().toLowerCase() ?? ""
  const sniffed = sniff(data)

  let format: Format | undefined
  if (hints.type) format = parseType(hints.type)
  format ??= EXTENSIONS[ext]
  format ??= fromMime(mime)
  format ??= sniffed?.format
  if (!format || format === "url") {
    const known = "topdf converts HTML, Markdown, plain text, images and PDF"
    if (ext) throw unsupported(`${ext} files are not supported; ${known}`)
    if (mime && mime !== "application/octet-stream") throw unsupported(`${mime} is not supported; ${known}`)
    throw unsupported(
      `Could not tell what kind of file this is. Give it a file name with an extension, a Content-Type, or a type parameter; ${known}`,
    )
  }

  if (format === "image") {
    const imageMime = IMAGE_MIME[ext] ?? (mime.startsWith("image/") ? mime : undefined) ?? sniffed?.mime
    if (!imageMime) throw unsupported("Could not tell which image format this is")
    return { format, mime: imageMime }
  }
  return { format }
}

function fromMime(mime: string): Format | undefined {
  if (!mime || mime === "application/octet-stream") return undefined
  if (mime.startsWith("image/")) return "image"
  return MIME_TYPES[mime]
}

function sniff(data: Buffer): (Detected & { format: Format }) | undefined {
  const starts = (bytes: number[], offset = 0) => bytes.every((byte, i) => data[offset + i] === byte)
  if (starts([0x25, 0x50, 0x44, 0x46])) return { format: "pdf" }
  if (starts([0x89, 0x50, 0x4e, 0x47])) return { format: "image", mime: "image/png" }
  if (starts([0xff, 0xd8, 0xff])) return { format: "image", mime: "image/jpeg" }
  if (starts([0x47, 0x49, 0x46, 0x38])) return { format: "image", mime: "image/gif" }
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return { format: "image", mime: "image/webp" }
  if (starts([0x42, 0x4d])) return { format: "image", mime: "image/bmp" }

  const head = data
    .subarray(0, 512)
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase()
  if (/^(<\?xml[^>]*>\s*)?(<!--.*?-->\s*)*<svg[\s>]/s.test(head)) return { format: "image", mime: "image/svg+xml" }
  if (/^(<!doctype html|<html[\s>])/.test(head)) return { format: "html" }
  return undefined
}
