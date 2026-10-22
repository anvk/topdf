// Reads a request into the inputs to convert and the options to print them with.
//   multipart/form-data  every file part, plus any `url` field, in the order sent; options as
//                        fields or as one JSON `options` field
//   application/json     { "url" | "html" | "markdown" | "text": "...", "options": { ... } }
//   anything else        the raw body is the file; `type` or `filename` in the query, the
//                        Content-Type, or the bytes themselves say what it is
// `url` in the query, with no body, converts a web page.
import type { FastifyRequest } from "fastify"
import type { Input } from "./convert/index.js"
import { badRequest, tooLarge } from "./errors.js"
import { detectFormat } from "./formats.js"
import { parseOptions, pickOptions, type PdfOptions } from "./options.js"

export interface ParsedRequest {
  inputs: Input[]
  options: PdfOptions
  // The first file's name, which the PDF is named after.
  filename?: string
}

export interface ParseLimits {
  maxBodyBytes: number
  maxFiles: number
}

type Query = Record<string, string | undefined>

const JSON_SOURCES = ["url", "html", "markdown", "text"] as const

export async function parseRequest(request: FastifyRequest, limits: ParseLimits): Promise<ParsedRequest> {
  const query = (request.query ?? {}) as Query
  if (request.isMultipart()) return parseMultipart(request, query, limits)

  const body = request.body
  if (isPlainObject(body)) return parseJson(body, query)

  const data = Buffer.isBuffer(body) ? body : Buffer.alloc(0)
  if (data.length === 0) {
    if (!query.url) throw badRequest("Send a file in the request body, a multipart upload, a JSON body, or a url parameter")
    return { inputs: [urlInput(query.url)], options: parseOptions(pickOptions(query)), filename: query.filename }
  }
  const detected = detectFormat(data, { type: query.type, filename: query.filename, contentType: request.headers["content-type"] })
  if (detected.format === "url") throw badRequest("Pass a URL in the url parameter, not as the body")
  return {
    inputs: [{ ...detected, format: detected.format, data, filename: query.filename }],
    options: parseOptions(pickOptions(query)),
    filename: query.filename,
  }
}

export function parseJson(body: Record<string, unknown>, query: Query = {}): ParsedRequest {
  const given = JSON_SOURCES.filter((key) => body[key] !== undefined)
  const unknown = Object.keys(body).filter(
    (key) => !(JSON_SOURCES as readonly string[]).includes(key) && key !== "options" && key !== "filename",
  )
  if (unknown.length > 0)
    throw badRequest(`Unknown field "${unknown[0]}". A JSON body takes one of ${JSON_SOURCES.join(", ")}, plus options and filename`)
  if (given.length !== 1) throw badRequest(`A JSON body takes exactly one of ${JSON_SOURCES.join(", ")}`)
  const key = given[0]
  const value = body[key]
  if (typeof value !== "string" || value === "") throw badRequest(`${key} must be a non-empty string`)
  if (body.options !== undefined && !isPlainObject(body.options)) throw badRequest("options must be an object")
  const filename = typeof body.filename === "string" ? body.filename : query.filename

  const options = parseOptions(pickOptions(query), (body.options as Record<string, unknown>) ?? {})
  if (key === "url") return { inputs: [urlInput(value)], options, filename }
  return { inputs: [{ format: key, data: Buffer.from(value, "utf8") }], options, filename }
}

async function parseMultipart(request: FastifyRequest, query: Query, limits: ParseLimits): Promise<ParsedRequest> {
  const inputs: Input[] = []
  const fields: Record<string, unknown> = {}
  let optionsField: Record<string, unknown> = {}
  let filename: string | undefined
  let total = 0

  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (inputs.length >= limits.maxFiles) throw tooLarge(`At most ${limits.maxFiles} files can be sent at once`)
      const data = await part.toBuffer()
      total += data.length
      if (total > limits.maxBodyBytes) throw tooLarge(`The upload is larger than ${limits.maxBodyBytes} bytes`)
      if (data.length === 0) throw badRequest(`${part.filename || "A file"} is empty`)
      const name = part.filename || undefined
      const detected = detectFormat(data, { filename: name, contentType: part.mimetype })
      if (detected.format === "url") throw badRequest("Pass URLs as url fields")
      inputs.push({ ...detected, format: detected.format, data, filename: name })
      filename ??= name
      continue
    }
    const value = typeof part.value === "string" ? part.value : String(part.value)
    if (part.fieldname === "url") {
      if (inputs.length >= limits.maxFiles) throw tooLarge(`At most ${limits.maxFiles} files can be sent at once`)
      inputs.push(urlInput(value))
    } else if (part.fieldname === "options") {
      try {
        optionsField = JSON.parse(value)
      } catch {
        throw badRequest("The options field must be a JSON object")
      }
      if (!isPlainObject(optionsField)) throw badRequest("The options field must be a JSON object")
    } else if (part.fieldname === "filename") {
      filename = value
    } else {
      fields[part.fieldname] = value
    }
  }

  if (inputs.length === 0) throw badRequest("The upload has no files and no url fields")
  const options = parseOptions(pickOptions(query), pickOptions(fields), optionsField)
  const unknown = Object.keys(fields).filter((key) => !(key in pickOptions(fields)))
  if (unknown.length > 0) throw badRequest(`Unknown field "${unknown[0]}"`)
  return { inputs, options, filename: query.filename ?? filename }
}

function urlInput(raw: string): Input {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw badRequest(`"${raw}" is not a URL`)
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw badRequest("Only http:// and https:// URLs can be converted")
  return { format: "url", url: url.href }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !Buffer.isBuffer(value)
}
