// Turns each input into a PDF, then joins them in order. Everything but a PDF is printed by
// Chromium: Markdown, text and images are first made into HTML pages.
import { conversionFailed, unsupported } from "../errors.js"
import type { Format } from "../formats.js"
import type { PdfOptions } from "../options.js"
import type { Renderer } from "./browser.js"
import { decodeText, imageDocument, markdownDocument, textDocument } from "./documents.js"
import { mergePdfs } from "./merge.js"

export type Input =
  | { format: "url"; url: string }
  | { format: Exclude<Format, "url">; data: Buffer; filename?: string; mime?: string }

export async function convertInputs(inputs: Input[], options: PdfOptions, renderer: Renderer): Promise<Buffer> {
  const pdfs: Buffer[] = []
  // One input at a time, so a request with many files takes one slot rather than all of them.
  for (const input of inputs) pdfs.push(await convertInput(input, options, renderer))
  return mergePdfs(pdfs)
}

async function convertInput(input: Input, options: PdfOptions, renderer: Renderer): Promise<Buffer> {
  switch (input.format) {
    case "url":
      return renderer.render({ url: input.url }, options)
    case "html":
      return renderer.render({ html: decodeText(input.data) }, options)
    case "markdown":
      return renderer.render({ html: markdownDocument(decodeText(input.data)) }, options)
    case "text":
      return renderer.render({ html: textDocument(decodeText(input.data)) }, options)
    case "image":
      if (!input.mime) throw unsupported("Could not tell which image format this is")
      return renderer.render({ html: imageDocument(input.data, input.mime) }, options)
    case "pdf":
      if (input.data.subarray(0, 1024).indexOf("%PDF-") === -1) throw conversionFailed("The file is not a PDF")
      return input.data
  }
}
