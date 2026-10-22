import assert from "node:assert/strict"
import { test } from "node:test"
import { PNG } from "../test/helpers.js"
import { decodeText, imageDocument, markdownDocument, textDocument } from "./documents.js"

test("Markdown becomes HTML with GitHub-style tables", () => {
  const html = markdownDocument("# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |\n")
  assert.match(html, /<h1[^>]*>Title<\/h1>/)
  assert.match(html, /<table>/)
  assert.match(html, /^<!doctype html>/)
})

test("plain text is escaped, so markup in it prints as written", () => {
  const html = textDocument("<script>alert(1)</script> & 'quotes'")
  assert.ok(!html.includes("<script>"))
  assert.match(html, /<pre>&#60;script&#62;alert\(1\)&#60;\/script&#62; &#38; &#39;quotes&#39;<\/pre>/)
})

test("an image is embedded as a data URI", () => {
  assert.ok(imageDocument(PNG, "image/png").includes(`src="data:image/png;base64,${PNG.toString("base64")}"`))
})

test("a UTF-8 byte order mark is dropped", () => {
  assert.equal(decodeText(Buffer.from("\uFEFFhello")), "hello")
})
