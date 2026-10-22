import fs from "node:fs"
import { PDFDocument } from "pdf-lib"
import { chromium } from "playwright"
import { loadConfig, type Config } from "../config.js"

export async function makePdf(pages = 1): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i += 1) doc.addPage([200, 200])
  return Buffer.from(await doc.save())
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return { ...loadConfig({}), logLevel: "silent", ...overrides }
}

// A 1×1 red PNG.
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64")

export function hasChromium(): boolean {
  try {
    return fs.existsSync(chromium.executablePath())
  } catch {
    return false
  }
}
