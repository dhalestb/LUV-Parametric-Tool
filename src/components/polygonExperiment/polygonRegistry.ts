import {officeRules} from './officeRegistry';
import original from './registry-data.json';
import type {Registry} from './model';
import {lobbyRules} from './lobbyRules';

import {flatDeepRule} from './flatDeepRule';

const checkpoint=original as unknown as Registry;
export default {...checkpoint,items:[...checkpoint.items,...lobbyRules,flatDeepRule,...officeRules]};
