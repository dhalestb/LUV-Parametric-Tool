import {useEffect,useRef,type ReactNode} from 'react';
import {WorkerAccess} from './workerClient';
import styles from './workflow.module.css';

export type RunAction = {run:()=>void; busy:boolean; message:string; reason?:string; fix?:ReactNode; target?:string; eligible?:string; correction?:ReactNode};

export function reveal(id:string) {
  const el=document.getElementById(id);
  if(!el)return;
  let parent:HTMLElement|null=el;
  while(parent){if(parent instanceof HTMLDetailsElement)parent.open=true;parent=parent.parentElement;}
  el.scrollIntoView({block:'start'});
  (el.matches('button,input,select')?el:el.querySelector<HTMLElement>('summary,button,input,select'))?.focus({preventScroll:true});
}

export default function WorkflowAction({action,site,method,allocation}:{action:RunAction;site:string;method:string;allocation:string}){
  const {busy,run,reason,fix,message,target,eligible,correction}=action;
  const access=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(message&&/access key|access is required|unauthorized|forbidden/i.test(message)){const details=access.current?.querySelector('details');if(details)details.open=true;}},[message]);
  return <section className={styles.run} id="generate-design" aria-labelledby="generate-heading">
    <div><h2 id="generate-heading"><small>03</small> Generate Design</h2>
      <p className={styles.summary}>{site} · {method}</p><p>{allocation}{target&&<> · Independent typology {target}</>}{eligible&&<> · Eligible typologies {eligible}</>}</p>
      <div className={reason?styles.blocked:styles.ready} role="status">{busy?'Generation in progress':reason||'Ready to generate'}</div>
      {reason&&fix&&<div className={styles.fix}>{fix}</div>}
      {message&&<p role="status" className={styles.feedback}>{message}</p>}
      {correction&&/^(Generation blocked|Error:)/.test(message)&&!/access key/i.test(message)&&<div className={styles.fix}>{correction}</div>}
    </div>
    <div ref={access} className={styles.runActions}><button className={styles.primary} disabled={busy||!!reason} onClick={run}>{busy?'Generating…':'Generate Design'}</button><WorkerAccess/></div>
  </section>;
}
