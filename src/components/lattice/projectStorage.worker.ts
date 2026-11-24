import { loadStoredProject, makeProject, readProject, storeProject, type ProjectState } from "./projectStorage";

self.onmessage = async (event: MessageEvent<{ id: number; action: "load" | "save" | "export" | "validate" | "open"; state?: ProjectState; text?: string; legacy?: string | null; expected?: string | null }>) => {
  const { id, action, state, text, legacy, expected } = event.data;
  try {
    if (action === "load") {
      const file = await loadStoredProject();
      const restored = file ? await readProject(file) : legacy ? await readProject(JSON.parse(legacy)) : null;
      self.postMessage({ id, value: { state: restored, checksum: file?.checksum ?? null } });
    } else if (action === "export") {
      self.postMessage({ id, value: JSON.stringify(await makeProject(state!)) });
    } else if (action === "validate") {
      await readProject(JSON.parse(text!));
      self.postMessage({ id, value: true });
    } else if (action === "open") {
      const restored = await readProject(JSON.parse(text!));
      const file = await makeProject(restored);
      await storeProject(file, expected ?? null);
      self.postMessage({ id, value: { state: restored, checksum: file.checksum } });
    } else {
      const file = await makeProject(state!);
      await storeProject(file, expected ?? null);
      self.postMessage({ id, value: file.checksum });
    }
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
  }
};
