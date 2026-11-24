import Studio from '@/components/polygonExperiment/Entry';
import registry from '@/components/polygonExperiment/registry-data.json';
import type { Registry } from '@/components/polygonExperiment/model';
export const metadata={title:'Polygon-Driven Architecture · LUV Experiment'};
export default function Page(){return <Studio registry={registry as unknown as Registry}/>;}
