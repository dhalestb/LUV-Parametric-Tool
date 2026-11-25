import original from './registry-data.json';
import type {Registry} from './model';
import {verticalLobby} from './verticalLobbyRule';

const checkpoint=original as unknown as Registry;
export default {...checkpoint,items:[...checkpoint.items,verticalLobby]};
