import assert from "node:assert/strict"
import { test } from "node:test"
import { DEFAULT_OPTIONS, parseOptions, pickOptions } from "./options.js"

test("no options gives the defaults", () => {
  assert.deepEqual(parseOptions(), DEFAULT_OPTIONS)
})

test("query strings, form fields and JSON all parse to the same options", () => {
  const fromQuery = parseOptions({ paper: "letter", landscape: "true", margin: "0.5in", background: "0", scale: "0.8", media: "Screen" })
  const fromJson = parseOptions({ paper: "Letter", landscape: true, margin: "0.5in", background: false, scale: 0.8, media: "screen" })
  assert.deepEqual(fromQuery, fromJson)
  assert.equal(fromQuery.paper, "Letter")
})

test("later sources override earlier ones", () => {
  assert.equal(parseOptions({ paper: "A3" }, { paper: "A5" }).paper, "A5")
})

test("bad values and unknown keys are refused", () => {
  for (const bad of [{ paper: "A9" }, { margin: "1 cm; color: red" }, { scale: 5 }, { landscape: "maybe" }, { waitUntil: "forever" }, { colour: "red" }]) {
    assert.throws(() => parseOptions(bad), /must|Unknown option/, JSON.stringify(bad))
  }
})

test("pickOptions leaves out fields that name the input", () => {
  assert.deepEqual(pickOptions({ url: "https://example.com", type: "html", paper: "A4" }), { paper: "A4" })
})
