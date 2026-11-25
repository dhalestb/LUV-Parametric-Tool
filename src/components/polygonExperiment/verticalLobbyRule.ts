import reference from './vertical-lobby-reference.json';
import type {RegistryItem} from './model';

export const verticalLobby:RegistryItem={
  id:'vertical-void-lobby',name:'Vertical Void Lobby',variants:['vertical-stack'],
  A:{entry:'lobbyProof.ts#populateLobby',statements:[
    'Stack L, U and V on one vertical axis at relative sizes of 140%, 100% and 75%.',
    'Floor letters lie horizontally. Wall letters stand, with the V rotating from 45° in 15° increments.',
    'Intersect adjacent letters and fit the assembled stack within its field.'
  ],parameters:{preferredFeet:13,overlapFeet:.45,checkpoint:'a6493b62cb784e7ccacc327dbe8dc90a604f1e48',engine:'bf7fc3c'},
    bindings:[{category:'A',sourceFile:'vendor/lobby-bf7fc3c/src/components/lobbyProof.ts',sha256:'e32694e6fc9476be3937bb75ac12500043a7e1a7ccd64a4541b5c94f5c315317'}]},
  B:{entry:'source-lobby-envelope.cjs#lobbyEnvelope',statements:[
    'Construct horizontal terraces and vertical walls from the projected letter profiles.',
    'Connect neighboring profiles and cut each inner letter contour through the envelope along its saved rotation.'
  ],parameters:{platformThicknessFeet:.75,fieldHeightsFeet:[20,40,60],lettersPerStack:[2,10]},
    bindings:[{category:'B',sourceFile:'vendor/lobby-bf7fc3c/scripts/source-lobby-envelope.cjs',sha256:'ed1d8c7693b364793eaddd26c7dbd409ecf45f8e22f597775c5179a3edb3080b'}]},
  evidence:[reference]
};
