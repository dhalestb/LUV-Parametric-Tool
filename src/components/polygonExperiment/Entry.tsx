'use client';

import AppNav from '@/components/AppNav';
import Studio from './Studio';
import styles from './workflow.module.css';
import WorkspaceShell from './WorkspaceShell';
import type { Registry } from './model';

export default function Entry({registry, lab, embedded}: {registry: Registry; lab: boolean; embedded: boolean}) {
  if (lab) return <WorkspaceShell />;
  return <>
    {!embedded && <header className={styles.navigation} style={{borderColor: 'var(--line)'}}>
      <AppNav />

    </header>}
    <Studio registry={registry} />
  </>;
}
