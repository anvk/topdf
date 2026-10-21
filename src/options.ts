// How the PDF is laid out. Options come from the query string, a multipart `options` field
// or a JSON body's `options` object, and are checked here whatever the source.
import { badRequest } from "./errors.js"

export const PAPER_SIZES = ["A3", "A4", "A5", "Letter", "Legal", "Tabloid"] as const
const WAIT_UNTIL = ["load", "domcontentloaded", "networkidle"] as const
const MEDIA = ["print", "screen"] as const

export interface PdfOptions {
  paper: (typeof PAPER_SIZES)[number]
  landscape: boolean
  // A CSS length applied to all four sides, such as "1cm" or "0.5in".
  margin: string
  background: boolean
  scale: number
  // Which CSS media the page is printed with; "screen" keeps the page as it looks in a browser.
  media: (typeof MEDIA)[number]
  waitUntil: (typeof WAIT_UNTIL)[number]
}

export const DEFAULT_OPTIONS: PdfOptions = {
  paper: "A4",
  landscape: false,
  margin: "1cm",
  background: true,
  scale: 1,
  media: "print",
  waitUntil: "load",
}

export const OPTION_NAMES = Object.keys(DEFAULT_OPTIONS) as (keyof PdfOptions)[]

// Later sources override earlier ones; unknown keys are refused so a typo is not silently ignored.
export function parseOptions(...sources: Record<string, unknown>[]): PdfOptions {
  const options = { ...DEFAULT_OPTIONS }
  for (const source of sources) {
    for (const [key, raw] of Object.entries(source)) {
      if (raw === undefined) continue
      switch (key) {
        case "paper": {
          const paper = PAPER_SIZES.find((size) => size.toLowerCase() === String(raw).toLowerCase())
          if (!paper) throw badRequest(`paper must be one of ${PAPER_SIZES.join(", ")}`)
          options.paper = paper
          break
        }
        case "landscape":
        case "background":
          options[key] = toBool(key, raw)
          break
        case "margin": {
          const margin = String(raw).trim()
          if (!/^(0|\d+(\.\d+)?(mm|cm|in|px|pt))$/.test(margin)) throw badRequest('margin must be a length such as "0", "10mm", "1cm" or "0.5in"')
          options.margin = margin
          break
        }
        case "scale": {
          const scale = Number(raw)
          if (!Number.isFinite(scale) || scale < 0.1 || scale > 2) throw badRequest("scale must be a number from 0.1 to 2")
          options.scale = scale
          break
        }
        case "media":
          options.media = oneOf(key, raw, MEDIA)
          break
        case "waitUntil":
          options.waitUntil = oneOf(key, raw, WAIT_UNTIL)
          break
        default:
          throw badRequest(`Unknown option "${key}". Options are: ${OPTION_NAMES.join(", ")}`)
      }
    }
  }
  return options
}

// The option keys among a set of query or form fields, leaving out the ones that name the input.
export function pickOptions(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([key]) => (OPTION_NAMES as string[]).includes(key)))
}

function toBool(name: string, raw: unknown): boolean {
  if (typeof raw === "boolean") return raw
  const text = String(raw).toLowerCase()
  if (["1", "true", "yes", "on", ""].includes(text)) return true
  if (["0", "false", "no", "off"].includes(text)) return false
  throw badRequest(`${name} must be true or false`)
}

function oneOf<T extends string>(name: string, raw: unknown, values: readonly T[]): T {
  const value = values.find((item) => item.toLowerCase() === String(raw).toLowerCase())
  if (!value) throw badRequest(`${name} must be one of ${values.join(", ")}`)
  return value
}
