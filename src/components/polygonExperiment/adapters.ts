import type { Registry, Typology } from './model';
export type RuleBinding={category:'A'|'B';sourceFile:string;sha256:string};
export type GeneratorAdapter={typology:Typology;variant:string;orientation:RuleBinding[];generation:RuleBinding[];savedRequest:Record<string,unknown>|null;execution:'gated-setup-phase'};
/** Preparation is deliberately pure: it does not import worker code or original persistence. */
export function prepareAdapter(adapter:GeneratorAdapter){
 if(adapter.execution!=='gated-setup-phase'||!adapter.orientation.length||!adapter.generation.length)throw Error('Both authentic rule categories must be bound.');
 for(const binding of [...adapter.orientation,...adapter.generation])if(!/^[a-f0-9]{64}$/.test(binding.sha256)||!binding.sourceFile.startsWith('vendor/architectural-board/'))throw Error('Unverified generator source.');
 return structuredClone(adapter);
}
export function executeGeneration():never {throw Error('Architectural execution is disabled during the rule-integration foundation phase.');}
/** Resolve an exact authentic variant; missing evidence never falls back to another generator. */
export function adapterForVariant(registry:Registry,typology:Typology,variant:string){
 const item=registry.items.find(t=>t.id===typology);
 if(!item||!item.variants.includes(variant))throw Error('Unknown typology or generator variant.');
 const evidence=item.evidence.find(e=>e.variant===variant);
 return {...prepareAdapter({typology,variant,orientation:item.A.bindings,generation:item.B.bindings,savedRequest:evidence?.request??null,execution:'gated-setup-phase'}),orientationEntry:item.A.entry,generationEntry:item.B.entry,snapshot:registry.snapshot,evidenceStatus:evidence?'saved-request-preserved':'source-only; no saved request located'};
}
