import original from './registry-data.json';
import type {Registry} from './model';
import {lobbyRules} from './lobbyRules';

const checkpoint=original as unknown as Registry;
export default {...checkpoint,items:[...checkpoint.items,...lobbyRules]};
