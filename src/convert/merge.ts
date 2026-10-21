import { PDFDocument } from "pdf-lib"
import { conversionFailed, errorMessage } from "../errors.js"

// One PDF holding every page of `pdfs`, in order. A single PDF is returned as it is.
export async function mergePdfs(pdfs: Buffer[]): Promise<Buffer> {
  if (pdfs.length === 1) return pdfs[0]
  const merged = await PDFDocument.create()
  for (const [index, pdf] of pdfs.entries()) {
    // pdf-lib reads a file lazily, so a broken one can load and only fail once its pages are copied.
    const pages = await unreadable(index, async () => {
      const source = await PDFDocument.load(pdf)
      return merged.copyPages(source, source.getPageIndices())
    })
    for (const page of pages) merged.addPage(page)
  }
  return Buffer.from(await merged.save())
}

export async function pageCount(pdf: Buffer): Promise<number> {
  return unreadable(0, async () => (await PDFDocument.load(pdf)).getPageCount())
}

async function unreadable<T>(index: number, read: () => Promise<T>): Promise<T> {
  try {
    return await read()
  } catch (error) {
    throw conversionFailed(`Input ${index + 1} is not a readable PDF: ${errorMessage(error)}`)
  }
}
