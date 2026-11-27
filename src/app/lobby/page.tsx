import AppNav from '@/components/AppNav';
import LobbyFinalPanel from '@/components/lobby-final/LobbyFinalPanel';
export const metadata={title:'Lobby — Approved Final Studies'};
export default async function LobbyPage({searchParams}:{searchParams:Promise<{study?:string}>}){
 const query=await searchParams;
 return <div style={{minHeight:'100vh',background:'#0a141e'}}><AppNav/><LobbyFinalPanel initialStudy={query.study}/></div>;
}

