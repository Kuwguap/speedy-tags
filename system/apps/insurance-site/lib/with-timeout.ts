/** Reject with `TimeoutError` if the promise does not resolve within `ms` milliseconds. */
export async function withTimeout<T> (p: Promise<T>, ms: number, label = 'Operation'): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (t) clearTimeout(t)
  }
}
