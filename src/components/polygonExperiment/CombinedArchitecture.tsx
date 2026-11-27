'use client';

import {Canvas} from '@react-three/fiber';
import {Bounds,Line,OrbitControls} from '@react-three/drei';
import {ArchitectureLighting} from './ArchitectureLighting';
import {SavedArchitectureMesh,useArchitecture} from './ArchitectureLayer';
import type {OrientationResult} from './orientationStore';
import type {SiteInput} from './model';

function Building({record}:{record:OrientationResult}){
  const {result}=useArchitecture(record);
  return result?<SavedArchitectureMesh result={result} combined={false}/>:null;
}

export default function CombinedArchitecture({site,records}:{site:SiteInput;records:OrientationResult[]}){
  return <div style={{height:440}} aria-label="Combined site architecture in 3D">
    <Canvas shadows camera={{position:[100,100,100],near:.05,far:100000}}>
      <color attach="background" args={['#101d22']}/><ArchitectureLighting studies={records}/>
      <OrbitControls makeDefault/>
      <Bounds key={site.fingerprint+records.map(r=>r.id).join('/')} fit clip observe margin={1.25}>
        {site.zones.map(z=>[z.polygon,...(z.holes??[])].map((ring,i)=><Line key={z.id+'-'+i} color="#83c6c2"
          points={[...ring,ring[0]].map(([x,z])=>[x,site.coordinates.elevationDatum,z])}/>))}
        {records.map(r=><Building key={r.id} record={r}/>)}
      </Bounds>
    </Canvas>
  </div>;
}
