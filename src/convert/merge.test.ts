import assert from "node:assert/strict"
import { test } from "node:test"
import { HttpError } from "../errors.js"
import { makePdf } from "../test/helpers.js"
import { mergePdfs, pageCount } from "./merge.js"

test("PDFs are joined in order", async () => {
  const merged = await mergePdfs([await makePdf(2), await makePdf(1), await makePdf(3)])
  assert.equal(await pageCount(merged), 6)
})

test("a single PDF is returned untouched", async () => {
  const pdf = await makePdf(1)
  assert.equal(await mergePdfs([pdf]), pdf)
})

test("a broken PDF names its position in the request", async () => {
  await assert.rejects(
    mergePdfs([await makePdf(1), Buffer.from("%PDF-1.7 not really")]),
    (error: unknown) => error instanceof HttpError && error.status === 422 && /Input 2/.test(error.message),
  )
})
