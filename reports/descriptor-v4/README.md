# Descriptor evaluation v4.1 — reports

Untracked working reports. Do not overwrite `../descriptor-measurement-audit/current-evaluator-dump.json`.

| File | Contents |
|---|---|
| `A-specification.md` | Architectural definitions, v3.5 vs v4 measurements, formulas, weights, colours |
| `B-before-after.md` | Full v3.5 15 × 12 tables; v4 fill-in after the comparison script; pair discussion |
| `C-diagram-verification.md` | v3.5 screenshot critique and v4 evidence-layer checklist |
| `D-implementation.md` | Worktree, files, tests, limitations |
| `E-validity.md` | Validity class per descriptor |
| `compare-v35-v4.mts` | Runs legacy + v4 on the 15 original OBJs |
| `audit-levels.mts` | Direct geometric level / branch / interface audit of the 15 original OBJs |
| `level-audit.md` | Written by the audit script: level counts, elevations, branches, verified vs potential |

```
npx --yes tsx reports/descriptor-v4/compare-v35-v4.mts
npx --yes tsx reports/descriptor-v4/audit-levels.mts
npx --yes tsx --test src/components/evaluations/v4/evaluateV4.test.ts src/components/evaluations/formIdentity.test.ts
```

Do not overwrite `../descriptor-measurement-audit/current-evaluator-dump.json`. The v3.5-to-v4.1 comparison has been run; see `comparison-tables.md`.
