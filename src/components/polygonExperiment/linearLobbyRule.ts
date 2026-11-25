import type {RegistryItem} from './model';
import reference from './linear-lobby-reference.json';

export const linearLobby:RegistryItem={
  id:'linear-gallery-lobby',name:'Linear Gallery Lobby',variants:['linear-gallery'],
  A:{entry:'lobbyProof.ts#populateLobby + lobbySpacingRules.ts#applyFixedLobbySpacing',statements:[
    'Alternate flat Ls at the base with upright, bowed Us along the gallery axis.',
    'After fitting the row, overlap each L with the following U by 0.747 ft and leave 1.013 ft between that U and the next L.'
  ],parameters:{preferredFeet:13,fieldFeet:[40,20,20],activeLetters:['L','U'],spacingRuleRevision:'lobby-spacing-2026-11-25',
    checkpoint:'a6493b62cb784e7ccacc327dbe8dc90a604f1e48',engine:'bfce854'},
    bindings:[{category:'A',sourceFile:'vendor/lobby-bfce854/src/components/lobbyProof.ts',sha256:'5bd022de048e48cfd0854bd5423364687fa1704bf4f93c1f836601a18b3e1b19'},
      {category:'A',sourceFile:'vendor/lobby-spacing-checkpoint/lobbySpacingRules.ts',sha256:'a11cbf61c9bf7b59db033a5ce47ccae47d6a3277be3c784d040eb06379679bbf'}]},
  B:{entry:'source-lobby-envelope.cjs#lobbyEnvelope',statements:[
    'Join letter outlines into a continuous bar with stepped terraces and cut the curved U openings through the shell.',
    'Place a pad above each flat letter and raise the upright-letter pads by 5.4 ft within the field height.'
  ],parameters:{platformThicknessFeet:.75,referenceStudy:77},
    bindings:[{category:'B',sourceFile:'vendor/lobby-bfce854/scripts/source-lobby-envelope.cjs',sha256:'bfce854844db696eb3c3759a36d90cfb4d3ed418432fc9aff15f08db6b5dec4d'}]},
  evidence:[reference]
};
