import reference from './compressed-lobby-reference.json';
import type {RegistryItem} from './model';

export const compressedLobby:RegistryItem={
  id:'compressed-sequential-lobby',name:'Compressed Sequential Lobby',variants:['sequential-shell'],
  A:{entry:'lobbyProof.ts#populateLobby',statements:[
    'Place an L at each end and alternate U and V along the middle of the hall.',
    'Roll the letters in the YZ plane, compress the middle pair, then turn the sequence down to the final horizontal L.',
    'Use the field width to set the spacing and fit the sequence as a unit.'
  ],parameters:{preferredFeet:13,checkpoint:'a6493b62cb784e7ccacc327dbe8dc90a604f1e48',engine:'bfce854'},
    bindings:[{category:'A',sourceFile:'vendor/lobby-bfce854/src/components/lobbyProof.ts',sha256:'5bd022de048e48cfd0854bd5423364687fa1704bf4f93c1f836601a18b3e1b19'}]},
  B:{entry:'source-lobby-envelope.cjs#lobbyEnvelope',statements:[
    'Loft the shell through the oriented letter profiles along the sequence.',
    'Cut a continuous cavity through the shell and extend the cut beyond both ends to keep the passage open.'
  ],parameters:{wallThicknessFeet:.5,fieldDepthFeet:20,fieldHeightFeet:20,referenceFieldWidthFeet:60},
    bindings:[{category:'B',sourceFile:'vendor/lobby-bfce854/scripts/source-lobby-envelope.cjs',sha256:'bfce854844db696eb3c3759a36d90cfb4d3ed418432fc9aff15f08db6b5dec4d'}]},
  evidence:[reference]
};
