"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadPresentationGraphics, loadPresentationPdfs, savePresentationGraphic, savePresentationPdf, loadPdfBoards, savePdfBoards, deletePdfBoard, loadTabOrder, saveTabOrder, resolveTabOrder, exportPresentationBackup, importPresentationBackup, loadPublishedPresentation, type PublishedPresentation, type PdfBoard } from "@/components/presentationGraphics";
import { lightenBoardFile } from "@/components/boardRaster";
import type { PrototypeCategory, PrototypeTypologyId } from "@/components/amphitheaterPrototype";
import AppNav from "@/components/AppNav";
import { PRESENTATION_BOARD_STORAGE_KEY, useBoardMode } from "@/components/BoardMode";

const rows: { category: PrototypeCategory; title: string; typologies: { id: PrototypeTypologyId; name: string }[] }[] = [
  { category: "lobby", title: "Lobby", typologies: [
    { id: "vertical-void-lobby", name: "Vertical Void Lobby" }, { id: "compressed-sequential-lobby", name: "Compressed Sequential Lobby" }, { id: "continuous-hall-lobby", name: "Continuous Hall Lobby" }, { id: "topographic-ground-field-lobby", name: "Topographic / Ground-Field Lobby" }, { id: "linear-gallery-lobby", name: "Linear Gallery Lobby" },
  ] },
  { category: "gathering", title: "Gathering", typologies: [
    { id: "stepped-amphitheater", name: "Stepped Amphitheater" }, { id: "void-field-gathering", name: "Void-Field Gathering" }, { id: "inserted-horizontal-plate", name: "Inserted Horizontal Plate" }, { id: "contained-room-within-volume", name: "Contained Room-Within-Volume" }, { id: "linear-edge-gallery", name: "Linear Edge Gallery" },
  ] },
  { category: "office", title: "Office", typologies: [
    { id: "open-hall-workspace", name: "Open Hall Workspace" }, { id: "cascaded-terraced-plates", name: "Cascaded / Terraced Plates" }, { id: "flat-deep-plan-plate", name: "Flat Deep-Plan Plate" }, { id: "void-edge-workspace", name: "Void-Edge Workspace" }, { id: "folded-undulating-work-surface", name: "Folded / Undulating Work Surface" },
  ] },
];
type DisplayGraphic = { name: string; url: string };
type ReadyBoard = { url: string; image: boolean };
const walkthroughUrl = "/tutorials/vertical-void-walkthrough.mp4";
const lobbyTypologies = rows[0].typologies;
const graphicBoards = ['geometry', 'rules', 'lobby-proofs'] as const;
type GraphicBoard = (typeof graphicBoards)[number];
function isGraphicBoard(value: string): value is GraphicBoard {
  return (graphicBoards as readonly string[]).includes(value);
}
function boardLabel(value: string, pdfTitle: string) {
  if (value === 'video') return 'Demo';
  if (value === 'rules') return 'Graphic Rules Board';
  if (value === 'geometry') return 'Geometry Board';
  if (value === 'lobby-proofs') return 'Lobby Proofs';
  return pdfTitle;
}
function rememberBoard(file: Blob) {
  const url = URL.createObjectURL(file);
  const image = file.type.startsWith('image/');
  if (image) { const preload = new Image(); preload.src = url; void preload.decode().catch(() => undefined); }
  return { url, image };
}

export default function CompositionPresentationPage() {
  const presentationMode = useBoardMode();
  const [toggleReady, setToggleReady] = useState(false);
  useEffect(() => { setToggleReady(true); }, []);
  const setPresentationMode = (next: boolean) => {
    const url = new URL(window.location.href);
    url.searchParams.set('presentationBoard', next ? '7407x2160' : 'off');
    try { sessionStorage.setItem(PRESENTATION_BOARD_STORAGE_KEY, String(next)); } catch { /* Mode is still stored in the URL. */ }
    window.history.replaceState(window.history.state, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  const [graphics, setGraphics] = useState<Partial<Record<PrototypeTypologyId, DisplayGraphic>>>({});
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(100);
  const [exportingLobby, setExportingLobby] = useState(false);
  const [board, setBoard] = useState('current');
  const [pdfBoards, setPdfBoards] = useState<PdfBoard[]>([{id:'current', title:'Blank Board'}]);
  const [tabOrder, setTabOrder] = useState<string[]>(['current', 'geometry', 'rules', 'lobby-proofs', 'video']);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [localApp, setLocalApp] = useState(false);
  useEffect(() => { setLocalApp(/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname)); }, []);
  const [boardRevision, setBoardRevision] = useState(0);
  const [draggedBoard, setDraggedBoard] = useState<string | null>(null);
  const isPdfBoard = !isGraphicBoard(board) && board !== 'video';
  const [published, setPublished] = useState<PublishedPresentation | null>(null);
  const [catalogReady, setCatalogReady] = useState(false);
  useEffect(() => {
    const request = new AbortController();
    void (async () => {
      let snapshot: PublishedPresentation | null = null;
      try { snapshot = await loadPublishedPresentation(request.signal); }
      catch { if (!request.signal.aborted) setError('Could not load the published presentation.'); }
      if (request.signal.aborted) return;
      const boards = await loadPdfBoards(snapshot?.boards.length ? snapshot.boards : undefined);
      const savedOrder = await loadTabOrder();
      if (request.signal.aborted) return;
      setPublished(snapshot); setPdfBoards(boards); setTabOrder(resolveTabOrder(savedOrder, boards.map(item => item.id)));
      setBoard(current => boards.some(item => item.id === current) ? current : boards[0]?.id ?? 'geometry');
    })().catch(() => { if (!request.signal.aborted) setError('Could not load board titles.'); })
      .finally(() => { if (!request.signal.aborted) setCatalogReady(true); });
    return () => request.abort();
  }, []);
  const [readyBoards, setReadyBoards] = useState<Record<string, ReadyBoard>>({});
  const [checkedBoards, setCheckedBoards] = useState<Record<string, true>>({});
  const readyRef = useRef(readyBoards);
  readyRef.current = readyBoards;
  const checkedRef = useRef(checkedBoards);
  checkedRef.current = checkedBoards;
  const seenRevision = useRef(boardRevision);
  const graphicCache = useRef<Partial<Record<GraphicBoard, { graphics: Partial<Record<PrototypeTypologyId, DisplayGraphic>>; urls: string[] }>>>({});
  const [pdfError, setPdfError] = useState('');
  const [draggingPdf, setDraggingPdf] = useState(false);
  const graphicRevision = useRef(boardRevision);
  useEffect(() => {
    if (!isGraphicBoard(board)) return;
    let active = true;
    if (graphicRevision.current !== boardRevision) {
      graphicRevision.current = boardRevision;
      for (const cached of Object.values(graphicCache.current)) cached?.urls.forEach(URL.revokeObjectURL);
      graphicCache.current = {};
    }
    const cached = graphicCache.current[board];
    if (cached) setGraphics(cached.graphics);
    const refresh = async () => {
      try {
        const records = await loadPresentationGraphics(board);
        if (!active) return;
        const next: Partial<Record<PrototypeTypologyId, DisplayGraphic>> = {}; const nextUrls: string[] = [];
        for (const record of board === 'lobby-proofs' ? [] : published?.[board] ?? []) next[record.typology] = { name: record.name, url: record.url };
        for (const record of records) {
          const image = board === 'lobby-proofs' || record.image.type === 'image/webp' ? record.image : await lightenBoardFile(record.image);
          if (image !== record.image) await savePresentationGraphic(record.typology, record.name, image, board);
          const url = URL.createObjectURL(image); nextUrls.push(url); next[record.typology] = { name: record.name, url };
        }
        const previous = graphicCache.current[board];
        graphicCache.current[board] = { graphics: next, urls: nextUrls };
        setGraphics(next); setError("");
        previous?.urls.forEach(URL.revokeObjectURL);
      } catch { if (active) setError("Could not load the saved presentation graphics."); }
    };
    if (!cached || published) void refresh();
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("composition-presentation") : null;
    if (channel) channel.onmessage = () => { void refresh(); };
    return () => { active = false; channel?.close(); };
  }, [board, boardRevision, published]);
  useEffect(() => {
    let active = true;
    if (!catalogReady) return () => { active = false; };
    if (seenRevision.current !== boardRevision) {
      seenRevision.current = boardRevision;
      for (const item of Object.values(readyRef.current)) URL.revokeObjectURL(item.url);
      readyRef.current = {};
      checkedRef.current = {};
      setReadyBoards({});
      setCheckedBoards({});
    }
    const order = tabOrder;
    const index = order.indexOf(board);
    const wanted = [order[index - 1], order[index], order[index + 1]].filter((id): id is string => Boolean(id) && !isGraphicBoard(id) && id !== 'video');
    const missing = wanted.filter(id => !readyRef.current[id] && !checkedRef.current[id]);
    if (!missing.length) return () => { active = false; };
    void loadPresentationPdfs(missing).then(async files => {
      const ordered = [...missing].sort((a, b) => Number(b === board) - Number(a === board));
      for (const id of ordered) {
        if (!active) return;
        const file = files.get(id);
        const publishedSlide = published?.pdfs.find(item => item.id === id);
        let slide = file;
        if (!slide && publishedSlide) {
          if (/\.pdf($|\?)/i.test(publishedSlide.url)) {
            const response = await fetch(publishedSlide.url);
            if (!response.ok) throw new Error('Could not load the published slide.');
            slide = new Blob([await response.arrayBuffer()], { type: 'application/pdf' });
          } else {
            setReadyBoards(current => current[id] ? current : { ...current, [id]: { url: publishedSlide.url, image: true } });
            continue;
          }
        }
        if (!slide) continue;
        const image = await lightenBoardFile(slide);
        if (!active) return;
        if (image !== slide) await savePresentationPdf(image, id);
        const entry = rememberBoard(image);
        setReadyBoards(current => {
          if (current[id]) { URL.revokeObjectURL(entry.url); return current; }
          return { ...current, [id]: entry };
        });
      }
      if (!active) return;
      setCheckedBoards(current => ({ ...current, ...Object.fromEntries(missing.map(id => [id, true as const])) }));
      for (const id of missing) checkedRef.current[id] = true;
    }).catch(() => { if (active) setPdfError('Could not convert this PDF into a WebP slide.'); });
    return () => { active = false; };
  }, [board, tabOrder, boardRevision, published, catalogReady]);
  useEffect(() => () => { for (const item of Object.values(readyRef.current)) URL.revokeObjectURL(item.url); }, []);
  const addPdf = async (file?: File) => {
    if (!file) return;
    const named = file.name.toLowerCase();
    if (!['application/pdf', 'image/webp', 'image/jpeg'].includes(file.type) && !/\.(pdf|webp|jpe?g)$/.test(named)) { setPdfError('Choose a PDF, WebP, or JPEG slide.'); return; }
    try {
      setPdfError('');
      const slide = await lightenBoardFile(file, file.name);
      await savePresentationPdf(slide, board);
      const next = rememberBoard(slide);
      setReadyBoards(current => {
        if (current[board]) URL.revokeObjectURL(current[board].url);
        return { ...current, [board]: next };
      });
      setCheckedBoards(current => ({ ...current, [board]: true }));
    }
    catch { setPdfError('Could not add this PDF to the board.'); }
  };
  const boardOrder = tabOrder;
  const updateBoards = (next: PdfBoard[]) => { setPdfBoards(next); void savePdfBoards(next).catch(() => setError('Could not save the board title.')); };
  const updateTabOrder = (next: string[]) => { setTabOrder(next); void saveTabOrder(next).catch(() => setError('Could not save the board order.')); };
  const tabTitle = (id: string) => pdfBoards.find(item => item.id === id)?.title || (id === 'geometry' ? 'Geometry Board' : id === 'rules' ? 'Graphic Rules Board' : id === 'lobby-proofs' ? 'Lobby Proofs' : id === 'video' ? 'Demo' : 'Untitled Board');
  const placeTab = (targetId: string) => {
    if (!draggedBoard || draggedBoard === targetId) return;
    const next = [...boardOrder];
    const from = next.indexOf(draggedBoard);
    const to = next.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    updateTabOrder(next);
    setDraggedBoard(null);
  };
  const currentTitle = pdfBoards.find(item => item.id === board)?.title ?? 'PDF Board';
  const boardIndex = boardOrder.indexOf(board);
  const removeCurrentBoard = async () => {
    if (!isPdfBoard || !pdfBoards.some(item => item.id === board)) return;
    if (!window.confirm(`Delete "${currentTitle}" and its PDF from this browser?`)) return;
    const next = pdfBoards.filter(item => item.id !== board);
    const nextOrder = tabOrder.filter(id => id !== board);
    try {
      await deletePdfBoard(board, next);
      await saveTabOrder(nextOrder);
      setReadyBoards(current => {
        if (current[board]) URL.revokeObjectURL(current[board].url);
        const rest = { ...current };
        delete rest[board];
        return rest;
      });
      setPdfBoards(next);
      setTabOrder(nextOrder);
      setBoard(nextOrder[Math.min(Math.max(boardIndex, 0), nextOrder.length - 1)] ?? 'geometry');
      setPdfError('');
      setError('');
    } catch { setError('Could not delete the PDF board.'); }
  };
  const syncBoards = async (action: 'save' | 'load') => {
    if (action === 'load' && !window.confirm('Replace the boards in this browser with the saved GitHub boards?')) return;
    setSyncing(true);
    setSyncMessage('');
    try {
      if (action === 'save') await savePdfBoards(pdfBoards);
      const response = await fetch('/api/presentation-github', action === 'save' ? {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(await exportPresentationBackup()),
      } : { method: 'GET', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'GitHub request failed.');
      if (action === 'load') {
        await importPresentationBackup(result);
        setPdfBoards(result.boards);
        setTabOrder(resolveTabOrder(result.tabOrder, result.boards.map((item: PdfBoard) => item.id)));
        setBoard(resolveTabOrder(result.tabOrder, result.boards.map((item: PdfBoard) => item.id))[0] ?? 'geometry');
        setBoardRevision(value => value + 1);
        if (typeof BroadcastChannel !== 'undefined') {
          const channel = new BroadcastChannel('composition-presentation');
          channel.postMessage('updated');
          channel.close();
        }
      }
      setSyncMessage(action === 'save' ? 'Boards saved to GitHub.' : 'Boards restored from GitHub.');
    } catch (error) { setSyncMessage(error instanceof Error ? error.message : 'Could not sync boards.'); }
    finally { setSyncing(false); }
  };
  const exportLobbyProofPng = async () => {
    setExportingLobby(true);
    setError("");
    try {
      const width = 4096;
      const header = Math.round(width * 0.045);
      const columnWidth = width / 5;
      const columnHeight = columnWidth * (5156 / 4096);
      const height = header + columnHeight;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = Math.round(height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not export the Lobby Proofs board.");
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);
      const titleSize = Math.round(width * 0.0105);
      ctx.font = `700 ${titleSize}px Arial, sans-serif`;
      ctx.letterSpacing = `${titleSize * 0.08}px`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const titleX = Math.round(width * 0.008);
      ctx.fillStyle = "#D6AD4F";
      ctx.fillText("LOBBY", titleX, header / 2);
      const lobbyWidth = ctx.measureText("LOBBY").width;
      ctx.fillStyle = "#F7F6F5";
      ctx.fillText(" PROTO-FORMS", titleX + lobbyWidth, header / 2);
      const rule = Math.max(1, Math.round(width / 3200));
      const load = async (url?: string) => url ? createImageBitmap(await (await fetch(url)).blob()) : null;
      for (const [col, item] of lobbyTypologies.entries()) {
        const x = col * columnWidth;
        const y = header;
        const bitmap = await load(graphics[item.id]?.url);
        if (bitmap) {
          const scale = Math.min(columnWidth / bitmap.width, columnHeight / bitmap.height);
          const drawWidth = bitmap.width * scale;
          const drawHeight = bitmap.height * scale;
          ctx.drawImage(bitmap, x + (columnWidth - drawWidth) / 2, y + (columnHeight - drawHeight) / 2, drawWidth, drawHeight);
          bitmap.close();
        } else {
          ctx.fillStyle = "#d6ad4f";
          ctx.font = `600 ${Math.round(columnWidth * 0.045)}px Arial, sans-serif`;
          ctx.letterSpacing = "0px";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(item.name, x + columnWidth / 2, y + columnHeight / 2, columnWidth * 0.86);
        }
      }
      ctx.fillStyle = "#F7F6F5";
      for (let col = 1; col < lobbyTypologies.length; col++) ctx.fillRect(Math.round(col * columnWidth) - rule, header, rule, columnHeight);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not export the Lobby Proofs board.")), "image/png"));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "lobby-proofs-4096.png";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not export the Lobby Proofs board.");
    } finally {
      setExportingLobby(false);
    }
  };
  return (
    <main data-board-page="presentation" className={`relative flex flex-col bg-black px-4 py-4 md:px-5 ${presentationMode ? 'h-full min-h-0' : 'min-h-screen'}`}>
      {!presentationMode && <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-semibold" style={{ color: "#d6ad4f" }}>Presentation</h1>

      </div>}
      {!presentationMode && <><div className="mt-3 overflow-x-auto pb-1"><AppNav /></div>
      {localApp && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <button type="button" disabled={syncing} onClick={() => void syncBoards('save')} className="rounded border px-3 py-1 disabled:opacity-40" style={{borderColor:'var(--line)'}}>Save boards to GitHub</button>
        <button type="button" disabled={syncing} onClick={() => void syncBoards('load')} className="rounded border px-3 py-1 disabled:opacity-40" style={{borderColor:'var(--line)'}}>Restore boards from GitHub</button>
        <span role="status" aria-live="polite">{syncing ? 'Connecting to GitHub…' : syncMessage}</span>
      </div>}</>}
      <div className={presentationMode && isPdfBoard ? "absolute inset-x-0 top-10 z-30 px-3 pb-3" : ""}><div className={`mt-4 flex w-full flex-wrap items-center gap-3 text-xs ${presentationMode ? 'justify-end' : ''}`} aria-label="Board navigation">
        {!presentationMode && <><button type="button" aria-label="Previous board" disabled={boardIndex === 0} onClick={() => setBoard(boardOrder[boardIndex - 1])} className="rounded border px-3 py-1 disabled:opacity-40" style={{borderColor: "var(--line)"}}>←</button>
        <span aria-live="polite" className="min-w-32 text-center font-semibold" style={{color:"#d6ad4f"}}>{boardLabel(board, currentTitle)}</span>
        <button type="button" aria-label="Next board" disabled={boardIndex === boardOrder.length - 1} onClick={() => setBoard(boardOrder[boardIndex + 1])} className="rounded border px-3 py-1 disabled:opacity-40" style={{borderColor: "var(--line)"}}>→</button></>}
      <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Board tabs">
        {boardOrder.map(id => <button key={id} type="button" draggable onDragStart={event => {setDraggedBoard(id);event.dataTransfer.effectAllowed='move';}} onDragEnd={() => setDraggedBoard(null)} onDragOver={event => {if(draggedBoard)event.preventDefault();}} onDrop={event => {event.preventDefault();placeTab(id);}} onClick={() => setBoard(id)} aria-pressed={board===id} title="Drag to place this tab before, between, or after the others" className="rounded border px-3 py-1" style={{borderColor:board===id?'#d6ad4f':'var(--line)'}}>{tabTitle(id)}</button>)}
      </div>
      </div>
      <div className={`mt-3 flex items-center gap-2 text-xs ${presentationMode ? 'justify-center' : ''}`} aria-label="Board zoom controls">
        {presentationMode && <><button type="button" aria-label="Previous board" disabled={boardIndex === 0} onClick={() => setBoard(boardOrder[boardIndex - 1])} className="rounded border px-3 py-1 disabled:opacity-40" style={{borderColor:"var(--line)"}}>←</button>
        <span aria-live="polite" className="min-w-32 text-center font-semibold" style={{color:"#d6ad4f"}}>{boardLabel(board, currentTitle)}</span>
        <button type="button" aria-label="Next board" disabled={boardIndex === boardOrder.length - 1} onClick={() => setBoard(boardOrder[boardIndex + 1])} className="rounded border px-3 py-1 disabled:opacity-40" style={{borderColor:"var(--line)"}}>→</button></>}
        <label className="flex items-center gap-1">Zoom <select aria-label="Board zoom percentage" value={zoom} onChange={event => setZoom(Number(event.target.value))} className="rounded border bg-black px-2 py-1 text-white" style={{borderColor:'var(--line)'}}>{[0,25,50,75,100,200,300,400,500,600,700,800,900,1000].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>
        {board === 'video' && <a href={walkthroughUrl} download className="rounded border px-3 py-1" style={{borderColor:'var(--line)',color:'#d6ad4f'}}>Download video</a>}
        {board === 'lobby-proofs' && <button type="button" disabled={exportingLobby} onClick={() => void exportLobbyProofPng()} className="rounded border px-3 py-1 disabled:opacity-40" style={{borderColor:'var(--line)',color:'#d6ad4f'}}>{exportingLobby ? 'Exporting PNG…' : 'Export PNG · 4096 px'}</button>}
        {presentationMode && <button data-board-edit-control type="button" onClick={() => setPresentationMode(false)} className="rounded border px-3 py-1" style={{borderColor:'var(--line)',color:'#d6ad4f'}}>Exit presentation mode</button>}
      </div></div>
      {!presentationMode && <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-2">Board <select aria-label="Select board to edit" value={board} onChange={event => setBoard(event.target.value)} className="rounded border bg-black px-2 py-1 text-white" style={{borderColor:'var(--line)'}}>{boardOrder.map(id => <option key={id} value={id}>{tabTitle(id)}</option>)}</select></label>
        <button type="button" onClick={() => {const item={id:'pdf-'+crypto.randomUUID(),title:'PDF Board '+(pdfBoards.length+1)};updateBoards([...pdfBoards,item]);updateTabOrder([...tabOrder,item.id]);setBoard(item.id);}} className="rounded border px-3 py-1" style={{borderColor:'var(--line)'}}>Add Board</button>
        {isPdfBoard && <label className="flex items-center gap-2">Title <input aria-label="PDF board title" value={currentTitle} onChange={event => updateBoards(pdfBoards.map(item => item.id===board ? {...item,title:event.target.value} : item))} className="rounded border bg-black px-2 py-1 text-white" style={{borderColor:'var(--line)'}} /></label>}
        {isPdfBoard && <button type="button" onClick={() => void removeCurrentBoard()} className="rounded border px-3 py-1" style={{borderColor:'var(--line)'}}>Delete board</button>}
      </div>}
      <div className={`presentation-board-viewport relative mt-2 flex min-h-0 w-full flex-1 ${isPdfBoard || board === 'video' ? 'pdf-board-viewport overflow-hidden' : 'overflow-auto'} ${isGraphicBoard(board) ? 'graphic-board-viewport' : ''}`} style={presentationMode ? undefined : {height:'calc(100dvh - 17rem)'}} aria-label="Presentation board viewport">
      <div onDragEnter={event => {if(!isPdfBoard)return;event.preventDefault();setDraggingPdf(true);}} onDragOver={event => {if(isPdfBoard)event.preventDefault();}} onDragLeave={event => {if(!isPdfBoard)return;if(!event.currentTarget.contains(event.relatedTarget as Node|null))setDraggingPdf(false);}} onDrop={event => {if(!isPdfBoard)return;event.preventDefault();setDraggingPdf(false);void addPdf(event.dataTransfer.files[0]);}} className="presentation-pdf-board relative min-h-0 w-full flex-1 overflow-hidden border border-dashed" style={isPdfBoard ? {borderColor:draggingPdf?'#d6ad4f':'#b9bec6',background:'#050709'} : {position:'absolute',inset:0,visibility:'hidden',pointerEvents:'none'}} aria-hidden={!isPdfBoard}>
        {(() => { const index = boardOrder.indexOf(board); return [boardOrder[index - 1], board, boardOrder[index + 1]].filter((id): id is string => Boolean(id) && Boolean(readyBoards[id])).map(id => { const item = readyBoards[id]; const active = id === board; return <img key={item.url} alt={active ? 'Presentation board' : ''} src={item.url} decoding={active ? 'sync' : 'async'} className="absolute inset-0 h-full w-full" style={{visibility: active ? 'visible' : 'hidden', objectFit:'contain', transform:`scale(${Math.max(zoom, 1) / 100})`}} />; }); })()}
        {isPdfBoard && (readyBoards[board] ? <div aria-hidden="true" className="absolute inset-0 z-10" /> : checkedBoards[board] ? <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 text-center text-xs text-white"><span>Drop a PDF, WebP, or JPEG here</span><span className="text-[#d6ad4f]">PDFs are saved and shown as WebP</span><input type="file" accept="application/pdf,image/webp,image/jpeg,.pdf,.webp,.jpg,.jpeg" className="sr-only" onChange={event => void addPdf(event.target.files?.[0])}/></label> : <p className="text-xs text-white">Loading slide…</p>)}
        {isPdfBoard && pdfError && <p role="alert" className="absolute bottom-2 left-2 bg-black/80 p-2 text-xs text-red-300">{pdfError}</p>}
      </div>
      {(board === 'video' || boardOrder[boardIndex - 1] === 'video' || boardOrder[boardIndex + 1] === 'video') && <div className={board === 'video' ? 'relative min-h-0 w-full flex-1 overflow-hidden bg-black' : 'absolute h-px w-px overflow-hidden'} aria-hidden={board !== 'video'}><video className="absolute inset-0 h-full w-full" style={{objectFit:'contain'}} controls preload="auto" playsInline aria-label="Vertical Void Lobby walkthrough"><source src={walkthroughUrl} type="video/mp4" />Your browser does not support video playback.</video></div>}
      {board === 'lobby-proofs' ? <div className={presentationMode ? 'lobby-proofs-frame' : 'mx-auto'} style={{width: zoom + "%", minWidth: (11 * zoom) + "px"}}>
        <div className="lobby-proofs-board flex min-h-0 flex-col bg-black" style={{ aspectRatio: "4096 / 1182", width: "100%", "--lobby-zoom": zoom / 100 } as React.CSSProperties} aria-label="Lobby proofs, five typology columns">
          <h2 className="lobby-proof-title shrink-0"><span>LOBBY</span> PROTO-FORMS</h2>
          <div className={`lobby-proof-columns grid min-h-0 flex-1 grid-cols-5 ${presentationMode ? "" : "border border-[#b9bec6]"}`}>
            {lobbyTypologies.map((item) => {
              const graphic = graphics[item.id];
              return <article key={item.id} aria-label={`Lobby proof: ${item.name}`} className="relative min-h-0 min-w-0 overflow-hidden bg-black">
                {graphic ? <img alt={`${graphic.name} proof board`} src={graphic.url} className="absolute inset-0 h-full w-full object-contain object-center" /> : <div className="flex h-full flex-col items-center justify-center p-2 text-center"><h3 className="lobby-proof-text text-xs font-semibold uppercase" style={{ color: "#d6ad4f" }}>{item.name}</h3><p className="lobby-proof-text mt-1 text-xs text-white">Export PNG to Board to fill this column.</p></div>}
              </article>;
            })}
          </div>
        </div>
      </div> : board !== 'video' && !isPdfBoard ? <div className={`space-y-2 ${presentationMode ? 'mx-auto' : ''}`} style={{width: zoom + "%", minWidth: (11 * zoom) + "px"}}>
        {rows.map((row) => <section key={row.category} aria-label={`${row.title} typologies`}>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "#d6ad4f" }}>{row.title}</h2>
          <div className="grid grid-cols-5 gap-2 md:gap-3">
            {row.typologies.map((item) => {
              const graphic = graphics[item.id];
              return <article key={item.id} aria-label={`${row.title}: ${item.name}`} className="relative min-w-0 overflow-hidden border border-[#b9bec6]" style={{ aspectRatio: "33 / 12.5" }}>
                {graphic ? <div role="img" aria-label={`${graphic.name} ${board === 'rules' ? 'graphic rules' : 'geometry views'}`} className="absolute inset-0 bg-center bg-no-repeat" style={{ backgroundImage: `url("${graphic.url}")`, backgroundSize: "100% 100%" }} /> : <div className="p-2"><h3 className="truncate text-[10px] font-semibold sm:text-xs" style={{ color: "#d6ad4f" }}>{item.name}</h3><p className="mt-1 text-[9px] text-white sm:text-[10px]">{board === 'rules' ? 'Download Graphic Rules to Board' : 'Download Geometry Board'} for this typology to fill this panel.</p></div>}
              </article>;
            })}
          </div>
        </section>)}
      </div> : null}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      {toggleReady && !presentationMode && createPortal(
        <button data-board-edit-control type="button" aria-pressed={false} aria-label="Presentation Mode" title="Presentation Mode" className="fixed bottom-3 right-3 z-50 rounded border bg-black/90 px-2 py-1 text-[11px]" style={{borderColor:'var(--line)',color:'#d6ad4f'}} onClick={() => setPresentationMode(true)}>Presentation Mode</button>
      , document.body)}
    </main>
  );
}

