import { loadForms } from "../formRepository";
import { moduleMesh } from "../moduleEnvelope";
import type { StoredForm } from "./hybrid.worker";

export type RepositoryForm = { key: string; form: StoredForm };

export async function generatedHybridSources(): Promise<RepositoryForm[]> {
  const saved = await loadForms();
  return saved.flatMap(entry => {
    const source = entry.snapshot.data.variants[entry.mode];
    if (!source.indices.length) return [];
    const mesh = moduleMesh(source, entry.cubeCenter, entry.moduleRange);
    const faces = [];
    for (let i = 0; i < mesh.indices.length; i += 3) {
      faces.push({ vertices: mesh.indices.slice(i, i + 3), normals: null });
    }
    const key = "generated-" + entry.typology + "-" + entry.savedAt;
    return [{
      key,
      form: {
        mesh: {
          id: key,
          filename: entry.snapshot.typology + " · " + entry.mode + ".obj",
          positions: Float32Array.from(mesh.positions),
          normals: new Float32Array(),
          faces,
          groups: [],
          suggestedSlotId: null,
          upAxis: "z" as const
        },
        fits: null,
        unit: "feet" as const,
        up: "z" as const
      }
    }];
  });
}
