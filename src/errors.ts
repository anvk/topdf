// An error that carries the HTTP status and the short code the client gets back.
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "HttpError"
  }
}

export const badRequest = (message: string) => new HttpError(400, "bad_request", message)
export const unsupported = (message: string) => new HttpError(415, "unsupported_type", message)
export const tooLarge = (message: string) => new HttpError(413, "too_large", message)
// The input was understood but could not be turned into a PDF (a broken file, a page that failed to load).
export const conversionFailed = (message: string) => new HttpError(422, "conversion_failed", message)
export const busy = (message: string) => new HttpError(503, "busy", message)
export const unavailable = (message: string) => new HttpError(503, "unavailable", message)
export const timedOut = (message: string) => new HttpError(504, "timeout", message)

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
