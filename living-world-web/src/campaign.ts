import { createDefaultContent, validateContent, type Battle, type GameContent, type Unit } from './core/battle';
export const SAVE_KEY = 'mistbound.expedition.v2';
export type CampaignMap = 'world' | 'local';
export type Outcome = Battle['winner'];
export interface LocalProgress { route: 'bridge' | 'woods'; stage: number; lastOutcome?: Outcome }
export const freshAreas = (): LocalProgress[] => Array.from({length:3},()=>({route:'bridge',stage:0}));
export interface Campaign { areas: LocalProgress[]; resumeMap: CampaignMap; started: boolean; team: Unit[]; location: number; cleared: number[]; visited: number[]; introSeen: boolean }
export interface SaveData { version: 2; content: GameContent; campaign: Campaign }
export function newCampaign(content: GameContent): Campaign { return { areas: freshAreas(), resumeMap:'world', started: false, team: structuredClone(content.squad), location: 0, cleared: [], visited: [], introSeen: false }; }
export function initialSave(): SaveData { const content=createDefaultContent(); return { version: 2,content,campaign:newCampaign(content) }; }
export function decodeSave(raw: string): SaveData {
 const data=JSON.parse(raw) as SaveData;
 if(!data||typeof data!=='object'||data.version!==2)throw new Error('存档版本不匹配');
 const content=validateContent(data.content), c=data.campaign;
 if(!c||typeof c.started!=='boolean'||typeof c.introSeen!=='boolean'||!Number.isInteger(c.location)||c.location<0||c.location>3||!Array.isArray(c.cleared)||!Array.isArray(c.visited)) throw new Error('远征记录无效');
 for(const values of [c.cleared,c.visited]) if(values.some(n=>!Number.isInteger(n)||n<0||n>2)||new Set(values).size!==values.length)throw new Error('据点记录无效');
 if(c.cleared.some(n=>n>0&&!c.cleared.includes(n-1))||c.location>1&&!c.cleared.includes(c.location-2))throw new Error('道路记录无效');
 const areas=c.areas??freshAreas();
 if(!Array.isArray(areas)||areas.length!==3||areas.some(a=>!a||!['bridge','woods'].includes(a.route)||!Number.isInteger(a.stage)||a.stage<0||a.stage>3))throw new Error('区域记录无效');
 if(areas.some(a=>a.lastOutcome!==undefined && !['ally','enemy','draw'].includes(a.lastOutcome))) throw new Error('战果记录无效');
 const resumeMap = c.resumeMap===undefined ? 'world' : c.resumeMap;
 if(!['world','local'].includes(resumeMap) || (resumeMap==='local' && (!c.started || c.location===0))) throw new Error('驻地地图无效');
 const team=validateContent({...content,squad:c.team}).squad;
 return {version:2,content,campaign:{started:c.started,introSeen:c.introSeen,location:c.location,cleared:[...c.cleared],visited:[...c.visited],areas:areas.map(a=>({route:a.route,stage:a.stage,...(a.lastOutcome ? {lastOutcome:a.lastOutcome} : {})})),resumeMap,team}};
}

/** The unit stays at its stronghold. Only the selected destination can move ahead. */
export function suggestedDestination(campaign: Campaign): number {
 const {location,cleared,areas}=campaign;
 const next=areas.findIndex((_,i)=>!cleared.includes(i));
 if(cleared.includes(location-1) && next>=0) return next+1;
 return location;
}

export function recordBattleOutcome(campaign: Campaign, index: number, result: Outcome): Campaign {
 const area=campaign.areas[index];
 if(!area || index!==campaign.location-1 || area.stage!==3) return campaign;
 const unlock=result==='ally' && !campaign.cleared.includes(index);
 if(!unlock && area.lastOutcome===result) return campaign;
 return {...campaign,
  areas:campaign.areas.map((p,i)=>i===index?{...p,lastOutcome:result}:p),
  cleared:unlock?[...campaign.cleared,index]:campaign.cleared,
 };
}
