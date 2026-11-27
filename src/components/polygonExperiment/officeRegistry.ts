import {reportRules as hall} from './workspaceRules/open-hall-workspace.report';
import {reportRules as edge} from './workspaceRules/void-edge-workspace.report';
import type {RegistryItem} from './model';
const entries=[
  {
    "id": "open-hall-workspace",
    "name": "Open Hall Workspace",
    "variants": [
      "native-v1.6.0"
    ],
    "A": {
      "entry": "arrangeOfficeLetters",
      "statements": [
        "Seat L guides for the floor, mezzanine, columns, wall panels and skylights."
      ],
      "parameters": {
        "version": "1.6.0",
        "sourceCommit": "ec79619d4b073ca09e2b6a466fa1f8cf2d2b9c4e"
      },
      "bindings": [
        {
          "category": "A",
          "sourceFile": "src/components/polygonExperiment/workspaceRules/open-hall-workspace.ts",
          "sha256": "3286e8d99de8ab45fb236c77c848b6026e6eacbe1b65815052e33dbb5f0a673c"
        }
      ]
    },
    "B": {
      "entry": "buildOfficeWorkspace",
      "statements": [
        "Assemble the hall, open mezzanine, perimeter walls and skylight roof."
      ],
      "parameters": {
        "version": "1.6.0"
      },
      "bindings": [
        {
          "category": "B",
          "sourceFile": "src/components/polygonExperiment/workspaceRules/open-hall-workspace.geometry.ts",
          "sha256": "8854e0aab15bf2251ad232ea033fbd7c78affa4fe885e625e6263a282a10c252"
        }
      ]
    },
    "evidence": []
  },
  {
    "id": "void-edge-workspace",
    "name": "Void Edge Workspace",
    "variants": [
      "native-v2.21.0"
    ],
    "A": {
      "entry": "voidEdgePlate",
      "statements": [
        "Arrange opposing plate and core U groups, bowed wall guides and paired column Ls."
      ],
      "parameters": {
        "version": "2.21.0",
        "sourceCommit": "ec79619d4b073ca09e2b6a466fa1f8cf2d2b9c4e"
      },
      "bindings": [
        {
          "category": "A",
          "sourceFile": "src/components/polygonExperiment/workspaceRules/void-edge-plate.ts",
          "sha256": "69b5d9948a8d4fcbc2a62214a0988e1b51aacd73e74c00c18e206771d6aa7c45"
        }
      ]
    },
    "B": {
      "entry": "buildOfficeWorkspace",
      "statements": [
        "Assemble rotating plates, alternating hollow cores and free stories with bowed walls and twisted piers."
      ],
      "parameters": {
        "version": "2.21.0"
      },
      "bindings": [
        {
          "category": "B",
          "sourceFile": "src/components/polygonExperiment/workspaceRules/void-edge-workspace.geometry.ts",
          "sha256": "3991aae69415fecba6d33f9ea0dcd18dce365426b3358426119603d212ee02b8"
        }
      ]
    },
    "evidence": []
  }
] satisfies RegistryItem[];
export const officeRules=entries.map(r=>{const rules=r.id==='open-hall-workspace'?hall:edge;return {...r,A:{...r.A,statements:rules.letterBindings.map(b=>b.title)},B:{...r.B,statements:rules.architectureBindings.map(b=>b.title)}};});
