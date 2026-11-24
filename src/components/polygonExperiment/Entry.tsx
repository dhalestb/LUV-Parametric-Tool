'use client';

import Link from 'next/link';
import AppNav from '@/components/AppNav';
import Studio from './Studio';
import { WorkerAccess } from './workerClient';
import WorkspaceShell from './WorkspaceShell';
import type { Registry } from './model';

export default function Entry({registry, lab, embedded}: {registry: Registry; lab: boolean; embedded: boolean}) {
  if (lab) return <WorkspaceShell />;
  return <>
    {!embedded && <header className="flex flex-wrap items-center gap-3 border-b p-3" style={{borderColor: 'var(--line)'}}>
      <AppNav />
      <Link href="/experiment-recovery/index.html">Restore Miami checkpoint</Link>
      <Link href="?workspace=lab">Experimental comparison workspace</Link>
      <WorkerAccess />
    </header>}
    <Studio registry={registry} />
  </>;
}
