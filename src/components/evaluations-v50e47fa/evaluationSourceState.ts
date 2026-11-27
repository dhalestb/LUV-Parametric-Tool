import type {ImportedObj, UnitName, UpAxisMode} from '../lattice/types';

export type EvaluationSourceState = {meshes: ImportedObj[]; assignments: Record<string, string | null>; unit: UnitName; upAxisMode: UpAxisMode};

const originalGatheringFilenames = new Map([
  ['stepped.obj', 'G1'],
  ['void field.obj', 'G2'],
  ['horizontal plate.obj', 'G3'],
  ['room in volume.obj', 'G4'],
  ['linear.obj', 'G5'],
]);

export function evaluationImportSlot(mesh: Pick<ImportedObj, 'filename' | 'suggestedSlotId'>): string | null {
  const filename = mesh.filename.toLowerCase().trim().replace(/[_\s]+/g, ' ');
  return originalGatheringFilenames.get(filename) ?? mesh.suggestedSlotId;
}

/** Copy typed coordinates, faces, bounds and assignments so analysis cannot mutate Lattice inputs. */
export function copyEvaluationSource(source: EvaluationSourceState): EvaluationSourceState {
  return structuredClone({meshes: source.meshes, assignments: source.assignments, unit: source.unit, upAxisMode: source.upAxisMode});
}

export function packEvaluationSource(source: EvaluationSourceState) {
  return JSON.stringify({version: 1, ...source, meshes: source.meshes.map(mesh => ({...mesh, positions: Array.from(mesh.positions), normals: Array.from(mesh.normals)}))});
}

export function unpackEvaluationSource(raw: string | null): EvaluationSourceState | null {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (value?.version !== 1 || !Array.isArray(value.meshes) || !value.assignments || !['feet','inches','meters','millimeters'].includes(value.unit)) return null;
    if (!['auto','y','z'].includes(value.upAxisMode)) return null;
    const meshes: ImportedObj[] = value.meshes.map((mesh: Omit<ImportedObj,'positions'|'normals'> & {positions: number[]; normals: number[]}) => {
      if (!mesh.id || !Array.isArray(mesh.positions) || !Array.isArray(mesh.normals) || !Array.isArray(mesh.faces)) throw Error('Invalid evaluation source.');
      return {...mesh, positions: new Float32Array(mesh.positions), normals: new Float32Array(mesh.normals)};
    });
    return {meshes, assignments: value.assignments, unit: value.unit, upAxisMode: value.upAxisMode};
  } catch { return null; }
}
