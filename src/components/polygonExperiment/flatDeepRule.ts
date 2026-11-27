import type {RegistryItem} from './model';

export const flatDeepRule = {
  "id": "flat-deep-plan-plate",
  "name": "Flat-Deep Plan Plate",
  "variants": [
    "native-v2.2.0"
  ],
  "A": {
    "entry": "arrangeOfficeLetters",
    "statements": [
      "Arrange native L guides for the plate corners, column grid and stepped perimeter walls."
    ],
    "parameters": {
      "version": "2.2.0",
      "sourceCommit": "d4d1242cacba09bf290af01367090f96e27cdb67",
      "fieldFeet": [
        20,
        60,
        20
      ]
    },
    "bindings": [
      {
        "category": "A",
        "sourceFile": "src/components/polygonExperiment/flatDeepRules/flat-deep-plan-plate.ts",
        "sha256": "1dd7c2efea4516d60403b9d44b8bbe54284808de7a6f2a471511637eb89475f1"
      },
      {
        "category": "A",
        "sourceFile": "src/components/polygonExperiment/flatDeepRules/flat-deep-plan-plate.plan.ts",
        "sha256": "556719def0c735a3ccd9466249720990be84b081b8444255f039a5b79aeeab60"
      }
    ]
  },
  "B": {
    "entry": "buildOfficeWorkspace",
    "statements": [
      "Assemble the native slabs, piers and walls at full scale."
    ],
    "parameters": {
      "version": "2.2.0",
      "fieldPlacement": "pack full native fields within each territory"
    },
    "bindings": [
      {
        "category": "B",
        "sourceFile": "src/components/polygonExperiment/flatDeepRules/flat-deep-plan-plate.geometry.ts",
        "sha256": "4cf91c9df483d7ff24376e940d4ed514ded7686f0fc3ec9cd8c86fd6776077fa"
      }
    ]
  },
  "evidence": []
} satisfies RegistryItem;
