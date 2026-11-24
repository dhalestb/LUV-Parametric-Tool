'use client';
import {useEffect,useState} from 'react';
import Studio from './Studio';
import WorkspaceShell from './WorkspaceShell';
import type {Registry} from './model';
export default function Entry({registry}:{registry:Registry}){const [embedded,setEmbedded]=useState<boolean|null>(null);useEffect(()=>setEmbedded(new URLSearchParams(location.search).get('embedded')==='1'),[]);if(embedded===null)return <p>Restoring isolated workspace…</p>;return embedded?<Studio registry={registry}/>:<WorkspaceShell/>;}
