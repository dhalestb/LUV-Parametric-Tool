'use client';
import dynamic from 'next/dynamic';
import {useEffect,useState} from 'react';
import {readLibrary} from '@/components/polygonExperiment/alternatives';
const Studio=dynamic(()=>import('@/components/siteDevelopment/SiteDevelopmentStudio'),{ssr:false});
const Manager=dynamic(()=>import('@/components/polygonExperiment/IntegrationPanel'),{ssr:false});
export default function Page(){const [,setShow]=useState(true);useEffect(()=>{const sync=()=>{try{setShow(readLibrary().showOriginal);}catch{}};sync();window.addEventListener('polygon-alternatives',sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener('polygon-alternatives',sync);window.removeEventListener('storage',sync);};},[]);return <><Manager manager/><div ><Studio/></div></>;}