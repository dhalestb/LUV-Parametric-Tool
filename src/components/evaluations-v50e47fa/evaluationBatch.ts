/** Evaluate large models sequentially, preserving the outcome for each source. */
export async function evaluateBatch<T, R>(sources: T[], evaluate: (source: T) => Promise<R>) {
  const outcomes: Array<{ source: T; ok: true; value: R } | { source: T; ok: false; error: string }> = [];
  for (const source of sources) {
    try {
      outcomes.push({ source, ok: true, value: await evaluate(source) });
    } catch (error) {
      outcomes.push({ source, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return outcomes;
}
