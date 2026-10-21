// Settings come from the environment; every one has a default, so the server starts with none set.

export interface Config {
  host: string
  port: number
  logLevel: string
  // Any request without `Authorization: Bearer <key>` (or `X-API-Key: <key>`) is refused when set.
  apiKey: string | null
  // The most one request may upload, across all its files.
  maxBodyBytes: number
  maxFiles: number
  // How long one input may take to load and print.
  timeoutMs: number
  // How long a request may wait for a free slot before it is turned away with 503.
  queueTimeoutMs: number
  browserConcurrency: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    host: env.HOST || "0.0.0.0",
    port: int(env, "PORT", 8080, 0),
    logLevel: env.TOPDF_LOG_LEVEL || "info",
    apiKey: env.TOPDF_API_KEY || null,
    maxBodyBytes: int(env, "TOPDF_MAX_BODY_MB", 25, 1) * 1024 * 1024,
    maxFiles: int(env, "TOPDF_MAX_FILES", 20, 1),
    timeoutMs: int(env, "TOPDF_TIMEOUT_MS", 60_000, 1000),
    queueTimeoutMs: int(env, "TOPDF_QUEUE_TIMEOUT_MS", 30_000, 0),
    browserConcurrency: int(env, "TOPDF_BROWSER_CONCURRENCY", 4, 1),
  }
}

function int(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number): number {
  const raw = env[name]
  if (raw === undefined || raw === "") return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min) throw new Error(`${name} must be a whole number of at least ${min}, got "${raw}"`)
  return value
}
