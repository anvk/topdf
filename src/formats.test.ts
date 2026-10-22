import assert from "node:assert/strict"
import { test } from "node:test"
import { HttpError } from "./errors.js"
import { detectFormat } from "./formats.js"
import { PNG } from "./test/helpers.js"

const text = (value: string) => Buffer.from(value)

test("the type a client names wins over the file name and Content-Type", () => {
  assert.equal(detectFormat(text("# hi"), { type: "md", filename: "a.txt", contentType: "text/html" }).format, "markdown")
})

test("the file name decides before the Content-Type", () => {
  assert.equal(detectFormat(text("# hi"), { filename: "notes.md", contentType: "text/plain" }).format, "markdown")
  assert.equal(detectFormat(text("hi"), { filename: "NOTES.TXT" }).format, "text")
})

test("the Content-Type decides when there is no file name", () => {
  assert.equal(detectFormat(text("<p>x</p>"), { contentType: "text/html; charset=utf-8" }).format, "html")
  assert.deepEqual(detectFormat(PNG, { contentType: "image/png" }), { format: "image", mime: "image/png" })
})

test("the first bytes decide when nothing else does", () => {
  assert.equal(detectFormat(text("%PDF-1.7\n")).format, "pdf")
  assert.deepEqual(detectFormat(PNG), { format: "image", mime: "image/png" })
  assert.deepEqual(detectFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), { format: "image", mime: "image/jpeg" })
  assert.equal(detectFormat(text("\uFEFF<!DOCTYPE html><p>x")).format, "html")
  assert.deepEqual(detectFormat(text('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>')), {
    format: "image",
    mime: "image/svg+xml",
  })
  // octet-stream says nothing, so the bytes still decide.
  assert.equal(detectFormat(text("%PDF-1.4"), { contentType: "application/octet-stream" }).format, "pdf")
})

test("images carry the MIME type they are embedded with", () => {
  assert.equal(detectFormat(text("<svg/>"), { filename: "logo.svg" }).mime, "image/svg+xml")
  assert.equal(detectFormat(PNG, { filename: "photo.jpeg" }).mime, "image/jpeg")
})

test("an unknown file or type is refused with 415", () => {
  const is415 = (error: unknown) => error instanceof HttpError && error.status === 415
  assert.throws(() => detectFormat(text("just some bytes")), is415)
  assert.throws(() => detectFormat(text("PK\u0003\u0004"), { filename: "report.docx" }), /\.docx files are not supported/)
  assert.throws(() => detectFormat(text("a,b"), { contentType: "text/csv" }), /text\/csv is not supported/)
  assert.throws(
    () => detectFormat(PNG, { type: "spreadsheet" }),
    (error: unknown) => error instanceof HttpError && error.status === 415,
  )
})
