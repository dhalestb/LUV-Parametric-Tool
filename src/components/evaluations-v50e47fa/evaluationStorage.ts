/** Evaluations owns its writes; historical spatial reviews are a read-only fallback. */
export const EVALUATION_STORAGE_PREFIX = 'luv-evaluations:50e47fa:';
export type EvaluationStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function isolatedEvaluationStorage(resolve: () => EvaluationStorage | null, readLegacyReviews = false): EvaluationStorage {
  return {
    getItem(key) {
      try {
        const store = resolve();
        if (!store) return null;
        const current = store.getItem(EVALUATION_STORAGE_PREFIX + key);
        return current ?? (readLegacyReviews && key.startsWith('luv-spatial-review:') ? store.getItem(key) : null);
      } catch { return null; }
    },
    setItem(key, value) {
      const store = resolve();
      if (!store) throw Error('Evaluations browser storage is unavailable.');
      store.setItem(EVALUATION_STORAGE_PREFIX + key, value);
    },
    removeItem(key) { resolve()?.removeItem(EVALUATION_STORAGE_PREFIX + key); },
  };
}

export const evaluationLocalStorage = isolatedEvaluationStorage(() => typeof window === 'undefined' ? null : window.localStorage, true);
export const evaluationSessionStorage = isolatedEvaluationStorage(() => typeof window === 'undefined' ? null : window.sessionStorage);
