"use client";

import { useEffect, useRef, useState } from "react";
import { useLatticeSource } from "@/components/lattice/latticeSource";
import { resolvedUp } from "@/components/lattice/types";
import { generatedHybridSources, type RepositoryForm } from "@/components/hybrid/repositorySources";
import AppNav from "@/components/AppNav";
import HybridViewer from "@/components/hybrid/HybridViewer";
import HybridRulesetLibrary from "@/components/hybrid/HybridRulesetLibrary";
import { UNIT_TO_FEET, type UnitName, type UpAxisMode } from "@/components/lattice/types";
import type { Family } from "@/components/hybrid/analyzeHybrid";

import type { HybridRequest, HybridReply, StoredForm } from "@/components/hybrid/hybrid.worker";

const families: Family[] = ["Lobby","Gathering","Hybrid"];
const slots = families.flatMap(family => [1,2,3].map(number => ({
  family, id:family+"-"+number, label:(family === "Hybrid" ? "Workspace Hybrid" : family+" Hybrid")+" "+number
})));

const control = "rounded border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-1.5 text-sm";

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request = indexedDB.open("hybrid-generation",2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("forms")) request.result.createObjectStore("forms");
      if (!request.result.objectStoreNames.contains("repository")) request.result.createObjectStore("repository");
    };
    request.onsuccess = ()=>resolve(request.result);
    request.onerror = ()=>reject(request.error);
  });
}

export default function HybridGeneration() {
  const lattice = useLatticeSource();
  const [repository, setRepository] = useState<Record<string, StoredForm>>({});
  const [generated, setGenerated] = useState<RepositoryForm[]>([]);
  const [selected,setSelected] = useState(slots[0]);
  const [forms,setForms] = useState<Record<string,StoredForm>>({});
  const [unit,setUnit] = useState<UnitName>("feet");
  const [axis,setAxis] = useState<UpAxisMode>("auto");
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  const [ready,setReady] = useState(false);
  const [drag,setDrag] = useState(false);
  const worker = useRef<Worker|null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const form = forms[selected.id];

  useEffect(()=>{
    let active = true;
    void (async()=>{
      const db = await openLibrary();
      try {
        const request = db.transaction("forms").objectStore("forms").openCursor();
        const records:Record<string,StoredForm> = {};
        await new Promise<void>((resolve,reject)=>{
          request.onsuccess = ()=>{
            const cursor = request.result;
            if (!cursor) {resolve();return;}
            records[String(cursor.key)] = cursor.value;
            cursor.continue();
          };
          request.onerror = ()=>reject(request.error);
        });
        const library: Record<string, StoredForm> = {};
        const repositoryRequest = db.transaction("repository").objectStore("repository").openCursor();
        await new Promise<void>((resolve, reject) => {
          repositoryRequest.onsuccess = () => {
            const cursor = repositoryRequest.result;
            if (!cursor) { resolve(); return; }
            library[String(cursor.key)] = cursor.value;
            cursor.continue();
          };
          repositoryRequest.onerror = () => reject(repositoryRequest.error);
        });
        // Retain uploads saved before the repository was introduced.
        for (const form of Object.values(records)) library[form.mesh.id] ??= { ...form, fits: null, ruleset: undefined };
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("repository", "readwrite");
          for (const [id, form] of Object.entries(library)) tx.objectStore("repository").put(form, id);
          tx.oncomplete = () => resolve();
          tx.onabort = tx.onerror = () => reject(tx.error);
        });
        if (active) { setForms(records); setRepository(library); }
      } finally {db.close();}
    })().catch(()=>{if(active)setMessage("Saved forms could not be loaded.");})
      .finally(()=>{if(active)setReady(true);});
    return ()=>{active=false;worker.current?.terminate();};
  },[]);

  useEffect(() => {
    let active = true;
    function refresh() {
      void generatedHybridSources().then(items => {
        if (active) setGenerated(items);
      }).catch(() => { if (active) setMessage("The generated form repository could not be loaded."); });
    }
    refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, []);

  const choices = [
    ...Object.values(repository).map(form => ({ key: form.mesh.id, form, group: "Uploaded OBJs" })),
    ...lattice.meshes.map(mesh => ({
      key: mesh.id,
      form: { mesh, fits: null, unit: lattice.unit, up: resolvedUp(mesh.upAxis, lattice.upAxisMode) },
      group: "Lattice repository"
    })),
    ...generated.map(item => ({ ...item, group: "Generated form repository" }))
  ].filter((choice, index, list) => list.findIndex(item => item.form.mesh.id === choice.form.mesh.id) === index);

  async function persist(slotId: string, result: StoredForm | null) {
    setForms(current => {
      const next = { ...current };
      if (result) next[slotId] = result;
      else delete next[slotId];
      return next;
    });
    if (result) setRepository(current => ({ ...current, [result.mesh.id]: { ...result, fits: null, ruleset: undefined } }));
    const db = await openLibrary();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["forms", "repository"], "readwrite");
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(tx.error);
        const slotStore = tx.objectStore("forms");
        if (result) {
          slotStore.put(result, slotId);
          tx.objectStore("repository").put({ ...result, fits: null, ruleset: undefined }, result.mesh.id);
        } else slotStore.delete(slotId);
      });
    } finally { db.close(); }
  }

  async function chooseSource(slot: typeof selected, key: string) {
    if (busy || !ready) return;
    const choice = choices.find(item => item.key === key);
    setSelected(slot);
    setBusy(true);
    setMessage("");
    try {
      await persist(slot.id, choice ? { ...choice.form, fits: null, ruleset: undefined } : null);
    } catch { setMessage("Loaded for this session. Browser storage could not save this form."); }
    finally { setBusy(false); }
  }

  function run(request: HybridRequest) {
    if (!ready || worker.current) return;
    const slotId = selected.id;
    setMessage("");
    const task = new Worker(new URL("../../components/hybrid/hybrid.worker.ts", import.meta.url));
    worker.current = task;
    setBusy(true);
    setMessage(request.action === "store" ? "Storing OBJ…" : "Analyzing form…");

    function finish() {
      task.terminate();
      worker.current = null;
      setBusy(false);
    }
    task.onerror = () => { setMessage("Could not process the OBJ."); finish(); };
    task.onmessage = async ({ data }: MessageEvent<HybridReply>) => {
      try {
        if ("error" in data) { setMessage(data.error); return; }
        const result = "stored" in data ? data.stored
          : request.action === "analyze" ? { ...request.form, fits: data.fits, ruleset: data.ruleset } : null;
        if (!result) throw Error("Unexpected worker reply");
        await persist(slotId, result);
        setMessage("");
      } catch { setMessage("Available for this session. Browser storage could not save this form."); }
      finally { finish(); }
    };
    task.postMessage(request);
  }

  function storeFile(files: FileList | null) {
    if (!files?.length) return;
    if (files.length !== 1 || !/\.obj$/i.test(files[0].name)) {
      setMessage("Choose one OBJ file for the selected slot.");
      return;
    }
    run({ action: "store", file: files[0], unit, axis });
  }

  return <main className="min-h-screen space-y-4 p-4" style={{color:"var(--ink)",background:"var(--app-background)"}}>
    <header className="flex flex-wrap items-center gap-4"><h1 className="text-xl font-semibold">Hybrid Generation</h1><AppNav/><a href="#hybrid-rulesets" className={control}>Hybrid Rulesets</a></header>
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
      <aside aria-label="Hybrid slots">{families.map(f=><section key={f} className="mb-4">
        <h2 className="mb-1 text-sm font-semibold">{f === "Hybrid" ? "Workspace" : f}</h2>
        {slots.filter(s=>s.family===f).map(slot=><div key={slot.id} className="mb-3">
          <button disabled={busy} aria-pressed={selected.id===slot.id}
            className={control+" mb-1 block w-full text-left"}
            style={{borderColor:selected.id===slot.id?"var(--accent)":undefined}}
            onClick={()=>{setSelected(slot);setMessage("");}}>{slot.label}</button>
          <label className="block text-xs">
            <span className="sr-only">{slot.label} repository</span>
            <select aria-label={slot.label+" repository"} className={control+" w-full min-w-0"}
              disabled={busy || !ready || !lattice.hydrated}
              value={choices.find(item=>item.form.mesh.id===forms[slot.id]?.mesh.id)?.key ?? ""}
              onChange={event=>void chooseSource(slot,event.target.value)}>
              <option value="">Choose from repository</option>
              {["Uploaded OBJs","Lattice repository","Generated form repository"].map(group=>
                <optgroup key={group} label={group}>
                  {choices.filter(item=>item.group===group).map(item=>
                    <option key={item.key} value={item.key}>{item.form.mesh.filename}</option>)}
                </optgroup>)}
            </select>
          </label>
        </div>)}
      </section>)}</aside>
      <section className={"rounded border-2 border-dashed p-4 "+(drag?"border-amber-400":"border-[var(--line)]")}
        onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);storeFile(e.dataTransfer.files);}}>
        <h2 className="mb-3 font-semibold">{selected.label}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label>Units <select className={control} value={unit} onChange={e=>setUnit(e.target.value as UnitName)}>{Object.keys(UNIT_TO_FEET).map(u=><option key={u}>{u}</option>)}</select></label>
          <label>Up axis <select className={control} value={axis} onChange={e=>setAxis(e.target.value as UpAxisMode)}>{["auto","y","z"].map(a=><option key={a}>{a}</option>)}</select></label>
          <button disabled={busy||!ready} className={control} onClick={()=>fileInput.current?.click()}>{form?"Replace OBJ":"Upload OBJ"}</button>
          <button disabled={busy || !ready || !form} className={control} onClick={()=>form && run({action:"analyze", form, family:selected.family})}>Analyze Form</button>
          <input hidden ref={fileInput} type="file" accept=".obj" onChange={e=>{storeFile(e.target.files);e.target.value="";}}/>
        </div>
        <p role="status" className="my-3 text-sm">{message || (form ? (form.fits ? (form.ruleset ? "Analysis complete." : "Analyze Form again to generate a hybrid ruleset.") : "OBJ stored. Select Analyze Form to see its typology mix.") : "Drop one OBJ here to store it.")}</p>
        {form && <><p className="text-sm">{form.mesh.filename} · {form.unit} · {form.up.toUpperCase()} up</p>
          <HybridViewer key={selected.id + ":" + form.mesh.id} form={form} /></>}
      </section>
      <section className="space-y-4"><HybridRulesetLibrary label={selected.label} form={form} ready={ready} /><h2 className="font-semibold">Typology mix</h2><p className="my-2 text-xs text-[var(--muted)]">Relative matches to {selected.family==="Hybrid"?"all 15":selected.family.toLowerCase()} typologies. Expand a match to see measured criteria. OBJ measurements approximate generator features such as named halls and rooms.</p>
      {form?.fits && !form.fits.some(f=>f.percent>0) && <p>No measurable match in this group.</p>}
      {form?.fits?.map(f=><details key={f.name} className="border-b border-[var(--line)] py-2 text-sm"><summary className="cursor-pointer">{f.name} <strong>{f.percent}%</strong></summary>
        <ul className="pl-4 text-xs">{f.evidence.map(line=><li key={line}>{line}</li>)}</ul></details>)}
      </section>
    </div>
  </main>;
}
