import Entry from '@/components/polygonExperiment/Entry';
import registry from '@/components/polygonExperiment/polygonRegistry';

export const metadata = { title: 'Polygon-Driven Architecture · LUV' };

export default async function Page({searchParams}: {searchParams: Promise<{workspace?: string; embedded?: string}>}) {
  const {workspace, embedded} = await searchParams;
  return <Entry registry={registry} lab={workspace === 'lab'} embedded={embedded === '1'} />;
}
