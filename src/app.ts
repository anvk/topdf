// The HTTP API: POST /convert and GET /health.
import { randomUUID, timingSafeEqual } from "node:crypto"
import path from "node:path"
import multipart from "@fastify/multipart"
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify"
import type { Config } from "./config.js"
import type { Renderer } from "./convert/browser.js"
import { convertInputs } from "./convert/index.js"
import { HttpError, badRequest, errorMessage } from "./errors.js"
import { FORMATS } from "./formats.js"
import { parseRequest } from "./inputs.js"

export interface AppDeps {
  config: Config
  renderer: Renderer
  // Conversion load, for /health.
  stats?: () => Record<string, unknown>
}

export async function buildApp({ config, renderer, stats }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: config.maxBodyBytes,
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
  })

  // Bodies are read as raw bytes unless they are JSON or multipart, so a file is never decoded as text by accident.
  app.removeAllContentTypeParsers()
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    try {
      done(null, body === "" ? {} : JSON.parse(body as string))
    } catch {
      done(badRequest("The body is not valid JSON"))
    }
  })
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) => done(null, body))
  await app.register(multipart, {
    limits: { fileSize: config.maxBodyBytes, files: config.maxFiles, fields: 50, fieldSize: 1024 * 1024 },
  })

  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id)
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      if (error.status >= 500) request.log.warn({ err: error }, error.message)
      return reply.status(error.status).send({ error: error.code, message: error.message, requestId: request.id })
    }
    const status = (error as { statusCode?: number }).statusCode
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ error: status === 413 ? "too_large" : "bad_request", message: errorMessage(error), requestId: request.id })
    }
    request.log.error({ err: error }, "conversion crashed")
    return reply.status(500).send({ error: "internal", message: "Something went wrong on the server", requestId: request.id })
  })

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: "not_found", message: `No route for ${request.method} ${request.url}`, requestId: request.id })
  })

  app.get("/health", async () => ({ status: "ok", formats: FORMATS, ...(stats ? { load: stats() } : {}) }))

  app.post("/convert", { onRequest: config.apiKey ? requireKey(config.apiKey) : [] }, async (request, reply) => {
    const started = Date.now()
    const { inputs, options, filename } = await parseRequest(request, config)

    const pdf = await convertInputs(inputs, options, renderer)
    request.log.info({ inputs: inputs.map((input) => input.format), bytes: pdf.length, ms: Date.now() - started }, "converted")
    return reply
      .type("application/pdf")
      .header("content-disposition", contentDisposition(pdfName(filename)))
      .send(pdf)
  })

  return app
}

function requireKey(key: string) {
  const expected = Buffer.from(key)
  return async (request: FastifyRequest) => {
    const header = request.headers.authorization
    const given = header?.startsWith("Bearer ") ? header.slice(7) : (request.headers["x-api-key"] as string | undefined)
    const actual = Buffer.from(given ?? "")
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new HttpError(401, "unauthorized", "Send the API key as Authorization: Bearer <key>")
    }
  }
}

export function pdfName(filename: string | undefined): string {
  const base = filename ? path.basename(filename, path.extname(filename)).replace(/[\u0000-\u001f"\\/]/g, "").trim() : ""
  return `${base || "document"}.pdf`
}

function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_")
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}
