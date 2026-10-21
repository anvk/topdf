// Prints HTML and web pages with one shared headless Chromium. Each conversion gets its own
// browser context, so pages never share cookies, storage or cache.
import { chromium, errors, type Browser } from "playwright"
import { HttpError, conversionFailed, errorMessage, timedOut, unavailable } from "../errors.js"
import { Limiter } from "../limiter.js"
import type { PdfOptions } from "../options.js"

export type PageSource = { html: string } | { url: string }

export interface Renderer {
  render(source: PageSource, options: PdfOptions): Promise<Buffer>
}

export interface BrowserRendererOptions {
  concurrency: number
  queueTimeoutMs: number
  timeoutMs: number
}

export class BrowserRenderer implements Renderer {
  private browser: Promise<Browser> | null = null
  private readonly limiter: Limiter

  constructor(private readonly options: BrowserRendererOptions) {
    this.limiter = new Limiter(options.concurrency, options.queueTimeoutMs)
  }

  stats() {
    return this.limiter.stats()
  }

  render(source: PageSource, options: PdfOptions): Promise<Buffer> {
    return this.limiter.run(async () => {
      const browser = await this.launch().catch((error) => {
        throw unavailable(`Chromium could not start: ${firstLine(errorMessage(error))}`)
      })
      const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: "block" })
      try {
        const page = await context.newPage()
        page.setDefaultTimeout(this.options.timeoutMs)
        await page.emulateMedia({ media: options.media })
        if ("url" in source) {
          const response = await page.goto(source.url, { waitUntil: options.waitUntil })
          if (response && response.status() >= 400) throw conversionFailed(`${source.url} answered with HTTP ${response.status()}`)
        } else {
          await page.setContent(source.html, { waitUntil: options.waitUntil })
        }
        const pdf = await page.pdf({
          format: options.paper,
          landscape: options.landscape,
          printBackground: options.background,
          scale: options.scale,
          margin: { top: options.margin, right: options.margin, bottom: options.margin, left: options.margin },
        })
        return Buffer.from(pdf)
      } catch (error) {
        if (error instanceof errors.TimeoutError) throw timedOut(`The page did not finish within ${this.options.timeoutMs} ms`)
        if (error instanceof HttpError) throw error
        throw conversionFailed(`The page could not be printed: ${firstLine(errorMessage(error))}`)
      } finally {
        await context.close().catch(() => {})
      }
    })
  }

  async close(): Promise<void> {
    const browser = this.browser
    this.browser = null
    if (browser) await (await browser.catch(() => null))?.close()
  }

  // Started on first use and again after a crash.
  private launch(): Promise<Browser> {
    if (!this.browser) {
      const launching = chromium.launch({ headless: true })
      this.browser = launching
      launching.then(
        (browser) =>
          browser.on("disconnected", () => {
            if (this.browser === launching) this.browser = null
          }),
        () => {
          if (this.browser === launching) this.browser = null
        },
      )
    }
    return this.browser
  }
}

function firstLine(text: string): string {
  return text.split("\n")[0]
}
