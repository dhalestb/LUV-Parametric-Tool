import type { ProjectState } from "./projectStorage";

export function createProjectStorageClient() {
  const worker = new Worker(new URL("./projectStorage.worker.ts", import.meta.url), { type: "module" });
  let sequence = 0;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const fail = (message: string) => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(message)); } pending.clear(); };
  worker.onerror = event => fail(event.message || "Project storage worker failed.");
  worker.onmessageerror = () => fail("Project data could not be cloned.");
  worker.onmessage = event => {
    const item = pending.get(event.data.id); if (!item) return;
    clearTimeout(item.timer); pending.delete(event.data.id);
    if (event.data.error) item.reject(new Error(event.data.error)); else item.resolve(event.data.value);
  };
  return {
    request<T>(action: "load" | "save" | "export" | "validate" | "open", data: { state?: ProjectState; text?: string; legacy?: string | null; expected?: string | null } = {}): Promise<T> {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve: value => resolve(value as T), reject, timer: setTimeout(() => { worker.terminate(); fail("Project processing exceeded the 120-second limit; save status is unverified. Preserve a portable backup before closing."); }, 120000) });
        try { worker.postMessage({ id, action, ...data }); }
        catch (error) { const item = pending.get(id)!; clearTimeout(item.timer); pending.delete(id); reject(error); }
      });
    },
    dispose() { worker.terminate(); fail("Project storage closed before completion."); },
  };
}
