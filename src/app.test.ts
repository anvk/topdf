import assert from "node:assert/strict"
import { test } from "node:test"
import type { InjectOptions } from "fastify"
import { buildApp } from "./app.js"
import type { Config } from "./config.js"
import type { PageSource, Renderer } from "./convert/browser.js"
import { pageCount } from "./convert/merge.js"
import type { PdfOptions } from "./options.js"
import { PNG, makePdf, testConfig } from "./test/helpers.js"

// A renderer that prints nothing: each call is recorded and returns a one-page PDF.
async function setup(config: Partial<Config> = {}) {
  const calls: Array<{ source: PageSource; options: PdfOptions }> = []
  const renderer: Renderer = {
    render: async (source, options) => {
      calls.push({ source, options })
      return makePdf(1)
    },
  }
  const app = await buildApp({ config: testConfig(config), renderer })
  return { app, calls }
}

async function multipart(build: (form: FormData) => void) {
  const form = new FormData()
  build(form)
  const response = new Response(form)
  return { payload: Buffer.from(await response.arrayBuffer()), headers: { "content-type": response.headers.get("content-type")! } }
}

test("a raw HTML body is printed with the options from the query", async () => {
  const { app, calls } = await setup()
  const res = await app.inject({ method: "POST", url: "/convert?paper=Letter&landscape=1", headers: { "content-type": "text/html" }, payload: "<h1>hi</h1>" })
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers["content-type"], "application/pdf")
  assert.match(String(res.headers["content-disposition"]), /filename="document.pdf"/)
  assert.ok(res.headers["x-request-id"])
  assert.equal(calls.length, 1)
  const call = calls[0]
  assert.deepEqual(call.source, { html: "<h1>hi</h1>" })
  assert.equal(call.options.paper, "Letter")
  assert.equal(call.options.landscape, true)
})

test("Markdown, text and images are turned into HTML pages", async () => {
  const { app, calls } = await setup()
  await app.inject({ method: "POST", url: "/convert?filename=notes.md", payload: "# Notes" })
  await app.inject({ method: "POST", url: "/convert", headers: { "content-type": "text/plain" }, payload: "<b>not bold</b>" })
  await app.inject({ method: "POST", url: "/convert", headers: { "content-type": "image/png" }, payload: PNG })
  const html = calls.map((call) => ("html" in call.source ? call.source.html : ""))
  assert.match(html[0], /<h1[^>]*>Notes<\/h1>/)
  assert.match(html[1], /&#60;b&#62;not bold/)
  assert.match(html[2], /data:image\/png;base64,/)
})

test("a JSON body converts a URL with its options", async () => {
  const { app, calls } = await setup()
  const res = await app.inject({ method: "POST", url: "/convert", payload: { url: "https://example.com/page", options: { media: "screen" } } })
  assert.equal(res.statusCode, 200)
  const call = calls[0]
  assert.deepEqual(call.source, { url: "https://example.com/page" })
  assert.equal(call.options.media, "screen")
})

test("a url query parameter with no body converts the page", async () => {
  const { app, calls } = await setup()
  const res = await app.inject({ method: "POST", url: "/convert?url=https%3A%2F%2Fexample.com" })
  assert.equal(res.statusCode, 200)
  assert.equal(calls.length, 1)
})

test("a multipart upload converts every file and url in order and merges them", async () => {
  const { app, calls } = await setup()
  const pdf = await makePdf(2)
  const { payload, headers } = await multipart((form) => {
    form.append("file", new Blob([new Uint8Array(PNG)], { type: "image/png" }), "photo.png")
    form.append("url", "https://example.com")
    form.append("file", new Blob(["plain text"]), "notes.txt")
    form.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "appendix.pdf")
    form.append("paper", "A5")
  })
  const res = await app.inject({ method: "POST", url: "/convert", headers, payload })
  assert.equal(res.statusCode, 200, res.body)
  assert.equal(await pageCount(res.rawPayload), 1 + 1 + 1 + 2)
  assert.match(String(res.headers["content-disposition"]), /filename="photo.pdf"/)
  assert.deepEqual(
    calls.map((call) => ("url" in call.source ? "url" : /data:image/.test(call.source.html) ? "image" : "text")),
    ["image", "url", "text"],
  )
  assert.ok(calls.every((call) => call.options.paper === "A5"))
})

test("multipart options can come as one JSON field", async () => {
  const { app, calls } = await setup()
  const { payload, headers } = await multipart((form) => {
    form.append("file", new Blob(["# x"]), "x.md")
    form.append("options", JSON.stringify({ margin: "0", background: false }))
  })
  assert.equal((await app.inject({ method: "POST", url: "/convert", headers, payload })).statusCode, 200)
  const call = calls[0]
  assert.equal(call.options.margin, "0")
  assert.equal(call.options.background, false)
})

test("requests that cannot be converted get a clear 4xx", async () => {
  const { app } = await setup()
  const cases: Array<[number, InjectOptions]> = [
    [400, { method: "POST", url: "/convert" }],
    [400, { method: "POST", url: "/convert", payload: { html: "<p>", markdown: "#" } }],
    [400, { method: "POST", url: "/convert", payload: { url: "file:///etc/passwd" } }],
    [400, { method: "POST", url: "/convert", payload: { html: "<p>", options: { paper: "A9" } } }],
    [400, { method: "POST", url: "/convert", headers: { "content-type": "application/json" }, payload: "{nope" }],
    [415, { method: "POST", url: "/convert", headers: { "content-type": "application/octet-stream" }, payload: "????" }],
    [415, { method: "POST", url: "/convert?filename=a.docx", payload: "PK\u0003\u0004" }],
    [422, { method: "POST", url: "/convert?type=pdf", payload: "not a pdf" }],
    [404, { method: "GET", url: "/nowhere" }],
  ]
  for (const [status, request] of cases) {
    const res = await app.inject(request)
    assert.equal(res.statusCode, status, `${JSON.stringify(request)} → ${res.body}`)
    assert.ok(res.json().message, res.body)
  }
})

test("uploads over the size limit are refused with 413", async () => {
  const { app } = await setup({ maxBodyBytes: 1024 })
  const res = await app.inject({ method: "POST", url: "/convert", headers: { "content-type": "text/html" }, payload: "x".repeat(2048) })
  assert.equal(res.statusCode, 413)
  const { payload, headers } = await multipart((form) => form.append("file", new Blob(["x".repeat(2048)]), "big.txt"))
  assert.equal((await app.inject({ method: "POST", url: "/convert", headers, payload })).statusCode, 413)
})

test("too many files are refused with 413", async () => {
  const { app } = await setup({ maxFiles: 2 })
  const { payload, headers } = await multipart((form) => {
    for (let i = 0; i < 3; i += 1) form.append("file", new Blob(["x"]), `${i}.txt`)
  })
  assert.equal((await app.inject({ method: "POST", url: "/convert", headers, payload })).statusCode, 413)
})

test("with an API key set, /convert needs it and /health does not", async () => {
  const { app } = await setup({ apiKey: "s3cret" })
  const convert = (headers: Record<string, string>) =>
    app.inject({ method: "POST", url: "/convert", headers: { "content-type": "text/html", ...headers }, payload: "<p>x</p>" })
  assert.equal((await convert({})).statusCode, 401)
  assert.equal((await convert({ authorization: "Bearer wrong" })).statusCode, 401)
  assert.equal((await convert({ authorization: "Bearer s3cret" })).statusCode, 200)
  assert.equal((await convert({ "x-api-key": "s3cret" })).statusCode, 200)
  assert.equal((await app.inject({ method: "GET", url: "/health" })).statusCode, 200)
})

test("/health lists the formats topdf converts", async () => {
  const { app } = await setup()
  const res = await app.inject({ method: "GET", url: "/health" })
  assert.equal(res.json().status, "ok")
  assert.deepEqual(res.json().formats, ["html", "url", "markdown", "text", "image", "pdf"])
})

test("a request id sent by the client is echoed back", async () => {
  const { app } = await setup()
  const res = await app.inject({ method: "GET", url: "/health", headers: { "x-request-id": "abc-123" } })
  assert.equal(res.headers["x-request-id"], "abc-123")
})
