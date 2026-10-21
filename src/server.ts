// Starts topdf: reads the environment and serves until SIGINT or SIGTERM.
import { buildApp } from "./app.js"
import { loadConfig } from "./config.js"
import { BrowserRenderer } from "./convert/browser.js"

const config = loadConfig()
const browser = new BrowserRenderer({
  concurrency: config.browserConcurrency,
  queueTimeoutMs: config.queueTimeoutMs,
  timeoutMs: config.timeoutMs,
})

const app = await buildApp({ config, renderer: browser, stats: () => browser.stats() })

let stopping = false
async function stop(signal: string) {
  if (stopping) return
  stopping = true
  app.log.info(`${signal}: finishing open requests`)
  await app.close()
  await browser.close()
  process.exit(0)
}
process.on("SIGINT", () => void stop("SIGINT"))
process.on("SIGTERM", () => void stop("SIGTERM"))

await app.listen({ host: config.host, port: config.port })
