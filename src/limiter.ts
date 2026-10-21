import { busy } from "./errors.js"

// Runs at most `size` tasks at once. A task that waits longer than `queueTimeoutMs` for a turn
// is refused with 503, so a burst of requests fails fast instead of piling up.
export class Limiter {
  private active = 0
  private readonly waiting: Array<() => void> = []

  constructor(
    private readonly size: number,
    private readonly queueTimeoutMs: number,
  ) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await task()
    } finally {
      this.release()
    }
  }

  stats(): { active: number; queued: number; size: number } {
    return { active: this.active, queued: this.waiting.length, size: this.size }
  }

  private acquire(): Promise<void> {
    if (this.active < this.size) {
      this.active += 1
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      const turn = () => {
        clearTimeout(timer)
        this.active += 1
        resolve()
      }
      const timer = setTimeout(() => {
        this.waiting.splice(this.waiting.indexOf(turn), 1)
        reject(busy("The server is busy; try again shortly"))
      }, this.queueTimeoutMs)
      this.waiting.push(turn)
    })
  }

  private release(): void {
    this.active -= 1
    this.waiting.shift()?.()
  }
}
