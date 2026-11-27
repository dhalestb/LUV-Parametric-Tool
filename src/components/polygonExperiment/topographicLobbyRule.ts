import type {RegistryItem} from './model';
import reference from './topographic-lobby-reference.json';

export const topographicLobby:RegistryItem={
  id:'topographic-ground-field-lobby',name:'Topographic Lobby',variants:['spiral-ground-field'],
  A:{entry:'lobbyProof.ts#populateLobby',statements:[
    'Repeat U, L and V through a 120° spiral. Each step rises by its plan travel and neighboring letters overlap.',
    'Tilt L plates from 0° to 45°, U edges from 45° to 90° and V boundaries from 90° to 120° in 15° increments.',
    'Set up to three floor letters flat. Fit the rising assembly into a cubic field.'
  ],parameters:{preferredFeet:13,spiralDegrees:120,fieldAspect:[1,1,1],checkpoint:'a6493b62cb784e7ccacc327dbe8dc90a604f1e48',engine:'bfce854'},
    bindings:[{category:'A',sourceFile:'vendor/lobby-bfce854/src/components/lobbyProof.ts',sha256:'5bd022de048e48cfd0854bd5423364687fa1704bf4f93c1f836601a18b3e1b19'}]},
  B:{entry:'source-lobby-envelope.cjs#lobbyEnvelope',statements:[
    'Form floor plates from horizontal letter profiles and walls from the tilted profiles.',
    'Cut the inner contours along their letter orientations to open recesses through the stepped envelope.'
  ],parameters:{platformThicknessFeet:.75,fieldHeightsFeet:[20,40,60],referenceStudy:65},
    bindings:[{category:'B',sourceFile:'vendor/lobby-bfce854/scripts/source-lobby-envelope.cjs',sha256:'bfce854844db696eb3c3759a36d90cfb4d3ed418432fc9aff15f08db6b5dec4d'}]},
  evidence:[reference]
};
