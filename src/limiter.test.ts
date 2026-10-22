import assert from "node:assert/strict"
import { test } from "node:test"
import { HttpError } from "./errors.js"
import { Limiter } from "./limiter.js"

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test("no more than `size` tasks run at once, and the rest wait their turn", async () => {
  const limiter = new Limiter(2, 1000)
  let running = 0
  let peak = 0
  const task = async () => {
    running += 1
    peak = Math.max(peak, running)
    await tick(10)
    running -= 1
  }
  await Promise.all(Array.from({ length: 6 }, () => limiter.run(task)))
  assert.equal(peak, 2)
  assert.deepEqual(limiter.stats(), { active: 0, queued: 0, size: 2 })
})

test("a task that waits too long is refused with 503 and leaves the queue", async () => {
  const limiter = new Limiter(1, 20)
  const slow = limiter.run(() => tick(100))
  await assert.rejects(
    limiter.run(async () => "late"),
    (error: unknown) => error instanceof HttpError && error.status === 503,
  )
  assert.equal(limiter.stats().queued, 0)
  await slow
})

test("a failing task frees its slot", async () => {
  const limiter = new Limiter(1, 1000)
  await assert.rejects(
    limiter.run(async () => Promise.reject(new Error("boom"))),
    /boom/,
  )
  assert.equal(await limiter.run(async () => "next"), "next")
})
