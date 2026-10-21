// Real conversions with Chromium. Skipped when Chromium has not been downloaded
// (`npx playwright install chromium`).
import assert from "node:assert/strict"
import http from "node:http"
import type { AddressInfo } from "node:net"
import { after, before, test } from "node:test"
import type { FastifyInstance, InjectOptions } from "fastify"
import { buildApp } from "./app.js"
import { BrowserRenderer } from "./convert/browser.js"
import { pageCount } from "./convert/merge.js"
import { PNG, hasChromium, testConfig } from "./test/helpers.js"

const skip = hasChromium() ? false : "Chromium is not installed"

let app: FastifyInstance
let browser: BrowserRenderer
// A page on this machine, standing in for an internal service.
let local: http.Server
let localUrl: string

before(async () => {
  if (skip) return
  local = http.createServer((req, res) => {
    res.writeHead(req.url === "/missing" ? 404 : 200, { "content-type": "text/html" })
    res.end("<h1>internal</h1>")
  })
  await new Promise<void>((resolve) => local.listen(0, "127.0.0.1", resolve))
  localUrl = `http://127.0.0.1:${(local.address() as AddressInfo).port}`

  const config = testConfig({ timeoutMs: 30_000 })
  browser = new BrowserRenderer({ concurrency: 2, queueTimeoutMs: 30_000, timeoutMs: config.timeoutMs })
  app = await buildApp({ config, renderer: browser })
})

after(async () => {
  if (skip) return
  await app.close()
  await browser.close()
  local.close()
})

const convert = (request: InjectOptions) => app.inject(request)

test("HTML prints to a PDF", { skip }, async () => {
  const res = await convert({ method: "POST", url: "/convert", headers: { "content-type": "text/html" }, payload: "<h1>Hello</h1>" })
  assert.equal(res.statusCode, 200, res.body)
  assert.equal(res.rawPayload.subarray(0, 5).toString(), "%PDF-")
  assert.equal(await pageCount(res.rawPayload), 1)
})

test("Markdown, text and an image each print to one page", { skip }, async () => {
  for (const request of [
    { url: "/convert?type=markdown", payload: "# Title\n\nSome *text*." },
    { url: "/convert?type=text", payload: "plain\ntext" },
    { url: "/convert", headers: { "content-type": "image/png" }, payload: PNG },
  ]) {
    const res = await convert({ method: "POST", ...request })
    assert.equal(res.statusCode, 200, res.body)
    assert.equal(await pageCount(res.rawPayload), 1, request.url)
  }
})

test("a long text runs onto more pages", { skip }, async () => {
  const res = await convert({ method: "POST", url: "/convert?type=text", payload: Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n") })
  assert.ok((await pageCount(res.rawPayload)) > 1)
})

test("a URL is loaded and printed", { skip }, async () => {
  const res = await convert({ method: "POST", url: "/convert", payload: { url: `${localUrl}/report` } })
  assert.equal(res.statusCode, 200, res.body)
  assert.equal(await pageCount(res.rawPayload), 1)
})

test("a URL answering 4xx is refused with 422", { skip }, async () => {
  const res = await convert({ method: "POST", url: "/convert", payload: { url: `${localUrl}/missing` } })
  assert.equal(res.statusCode, 422)
  assert.match(res.json().message, /HTTP 404/)
})
