import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {parseObj} from '../lattice/parseObj';
import {copyEvaluationSource,evaluationImportSlot,packEvaluationSource,unpackEvaluationSource} from './evaluationSourceState';
import {EVALUATION_STORAGE_PREFIX,isolatedEvaluationStorage} from './evaluationStorage';
import {VISIBLE_DESCRIPTOR_IDS} from './visibleDescriptors';
import {publishDescriptorRanks,readV4Cache} from './objDescriptorAnalysis';
import {readV4Cache as readOriginalV4Cache} from '../evaluations/objDescriptorAnalysis';

describe('Evaluations isolation',()=>{
  it('assigns original Gathering files without overriding other typology aliases', () => {
    const geometry = 'v 0 0 0\nv 2 0 0\nv 0 2 0\nf 1 2 3';
    const matches = {
      'Stepped.obj': 'G1', 'Void_Field.obj': 'G2', 'Horizontal_Plate.obj': 'G3',
      'Room_In_Volume.obj': 'G4', 'Linear.obj': 'G5', 'ROOM_IN_VOLUME.OBJ': 'G4',
      'Stepped Amphitheater.obj': 'G1', 'Contained Room.obj': 'G4',
      'Linear Gallery Lobby.obj': 'L5', 'Vertical Void Lobby.obj': 'L1',
      'Terraced Plates.obj': 'O2', 'Open Hall Workspace.obj': 'O1',
    };
    for (const [filename, slot] of Object.entries(matches)) {
      assert.equal(evaluationImportSlot(parseObj(geometry, filename)), slot, filename);
    }
    for (const filename of ['Custom Linear.obj', 'Stepped Service.obj', 'Room_In_Volume_variant.obj']) {
      assert.equal(evaluationImportSlot(parseObj(geometry, filename)), null, filename);
    }
  });
  it('copies source coordinates, nested faces, assignments and units without sharing mutable Lattice data',()=>{
    const mesh=parseObj('v 0 0 0\nv 2 0 0\nv 0 2 0\nf 1 2 3','L3-test.obj');
    const lattice={meshes:[mesh],assignments:{L3:mesh.id},unit:'feet' as const,upAxisMode:'auto' as const},before=packEvaluationSource(lattice),copy=copyEvaluationSource(lattice);
    copy.meshes[0].positions[0]=100;copy.meshes[0].faces[0].vertices[0]=2;copy.assignments.L3=null;copy.unit='meters';copy.meshes=[];
    assert.equal(packEvaluationSource(lattice),before);
    assert.deepEqual(unpackEvaluationSource(before),lattice);
  });
  it('writes, clears and restores only its own source, rank and review keys',()=>{
    const values=new Map([['vul-lattice-session','original meshes and assignments'],['vul-descriptor-ranks','original ranks'],['vul-prototype-session','original Proto-Form state'],['luv-spatial-review:old','original review']]),before=new Map(values);
    const store={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}},local=isolatedEvaluationStorage(()=>store,true),session=isolatedEvaluationStorage(()=>store);
    assert.equal(local.getItem('luv-spatial-review:old'),'original review');
    assert.equal(session.getItem('vul-descriptor-ranks'),null);
    local.setItem('source-session','independent import');session.setItem('vul-descriptor-ranks','new evaluations ranks');local.setItem('luv-spatial-review:old','updated evaluations review');
    assert.equal(local.getItem('luv-spatial-review:old'),'updated evaluations review');local.removeItem('source-session');
    for(const[key,value]of before)assert.equal(values.get(key),value);
    assert([...values.keys()].filter(key=>!before.has(key)).every(key=>key.startsWith(EVALUATION_STORAGE_PREFIX)));
  });
  it('does not evict other sessions when its own browser storage is full',()=>{
    const values=new Map([['vul-lattice-session','keep'],['vul-descriptor-ranks','keep ranks']]);let deletes=0;
    const store=isolatedEvaluationStorage(()=>({getItem:key=>values.get(key)??null,setItem(){throw Error('Quota exceeded');},removeItem(){deletes++;}}));
    assert.throws(()=>store.setItem('source-session','large upload'),/Quota/);assert.equal(deletes,0);assert.deepEqual([...values],[['vul-lattice-session','keep'],['vul-descriptor-ranks','keep ranks']]);
  });
  it('publishes through the isolated session adapter and keeps the original evaluator cache separate',()=>{
    const values=new Map([['vul-descriptor-ranks','unchanged Lattice ranking']]),previous=Object.getOwnPropertyDescriptor(globalThis,'window');
    const sessionStorage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
    try{
      Object.defineProperty(globalThis,'window',{configurable:true,value:{sessionStorage}});
      publishDescriptorRanks([{slotId:'L3',meshId:'independent',filename:'L3.obj',descriptors:[]}]);
      assert.equal(values.get('vul-descriptor-ranks'),'unchanged Lattice ranking');
      const published=JSON.parse(values.get(EVALUATION_STORAGE_PREFIX+'vul-descriptor-ranks')!);assert.equal(published.forms[0].meshId,'independent');
      assert.notEqual(readV4Cache(),readOriginalV4Cache());
    }finally{if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}
  });
  it('keeps the requested five display descriptors and rejects invalid stored source state',()=>{
    assert.deepEqual(VISIBLE_DESCRIPTOR_IDS,['openVolume','visuallyConnected','circulationActivated','verticallyIntegrated','centralized']);
    for(const raw of [null,'invalid','{}','{"version":1,"meshes":[]}'])assert.equal(unpackEvaluationSource(raw),null);
  });
  it('archives the previous Open Volume ranking byte-for-byte before publishing the new calibration',()=>{
    const old=JSON.stringify({version:'v4.3.0',openVolumeVersion:'v4.6.0',forms:[{slotId:'G5',descriptors:{openVolume:{absoluteScore:37.21448600040875}}}]}),key=EVALUATION_STORAGE_PREFIX+'vul-descriptor-ranks';
    const values=new Map([['vul-descriptor-ranks','untouched Lattice ranks'],[key,old]]),previous=Object.getOwnPropertyDescriptor(globalThis,'window');
    const sessionStorage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
    try{
      Object.defineProperty(globalThis,'window',{configurable:true,value:{sessionStorage}});
      publishDescriptorRanks([]);
      const archive=key+'-before-open-volume-v4.6.0';assert.equal(values.get(archive),old);
      assert.equal(JSON.parse(values.get(key)!).openVolumeVersion,'v4.7.0');assert.equal(values.get('vul-descriptor-ranks'),'untouched Lattice ranks');
      publishDescriptorRanks([]);assert.equal(values.get(archive),old);
    }finally{if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}
  });
});
