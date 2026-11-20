import { describe, it, expect } from 'vitest';
import { decodeSave, initialSave, newCampaign, recordBattleOutcome, suggestedDestination } from './campaign';
describe('local campaign saves',()=>{
 it('round trips editable content, formation and exploration progress',()=>{const save=initialSave();save.campaign.started=true;save.campaign.introSeen=true;save.campaign.location=2;save.campaign.cleared=[0];save.campaign.visited=[0,1];save.campaign.areas[1]={route:'woods',stage:2};save.content.skills.heavy.name='断雾斩';expect(decodeSave(JSON.stringify(save))).toEqual(save);});
 it('isolates squad defaults from campaign mutations',()=>{const save=initialSave();const campaign=newCampaign(save.content);campaign.team[0].name='新名字';campaign.team[0].rules[0].enabled=false;expect(save.content.squad[0].name).toBe('莱恩');expect(save.content.squad[0].rules[0].enabled).toBe(true);});
 it.each(['bad json','null','[]','{"version":1}'])('rejects invalid save %s',raw=>{expect(()=>decodeSave(raw)).toThrow();});
 it('rejects paths that skip unbeaten encounters',()=>{const save=initialSave();save.campaign.location=3;expect(()=>decodeSave(JSON.stringify(save))).toThrow('道路');save.campaign.location=0;save.campaign.cleared=[1];expect(()=>decodeSave(JSON.stringify(save))).toThrow('道路');});
 it('rejects invalid squad and duplicate positions',()=>{const save=initialSave();save.campaign.team[0].slot=save.campaign.team[1].slot;expect(()=>decodeSave(JSON.stringify(save))).toThrow('阵位');});
 it('rejects duplicate cleared and out-of-range visited records',()=>{const save=initialSave();save.campaign.cleared=[0,0];expect(()=>decodeSave(JSON.stringify(save))).toThrow('据点');save.campaign.cleared=[];save.campaign.visited=[3];expect(()=>decodeSave(JSON.stringify(save))).toThrow('据点');});
 it('rejects unknown local routes and impossible progress',()=>{const save=initialSave();save.campaign.areas[0].stage=4;expect(()=>decodeSave(JSON.stringify(save))).toThrow('区域');const raw=JSON.parse(JSON.stringify(initialSave()));raw.campaign.areas[0].route='teleport';expect(()=>decodeSave(JSON.stringify(raw))).toThrow('区域');});
 it('rejects malformed campaign fields',()=>{for(const patch of [{started:1},{visited:{}},{introSeen:'yes'},{location:1.5}]){const save=initialSave();Object.assign(save.campaign,patch);expect(()=>decodeSave(JSON.stringify(save))).toThrow('远征');}});
 it('migrates early v2 saves without local area progress',()=>{const save=JSON.parse(JSON.stringify(initialSave()));delete save.campaign.areas;expect(decodeSave(JSON.stringify(save)).campaign.areas).toHaveLength(3);});
});

describe('between maps and battle results',()=>{
 function atFort(){
  const save=initialSave();
  Object.assign(save.campaign,{started:true,introSeen:true,location:1,visited:[0],resumeMap:'local'});
  save.campaign.areas[0]={route:'woods',stage:3};
  return save;
 }
 it('returns to the same route and recommends an adjacent destination without moving the unit',()=>{
  const save=atFort();
  save.campaign=recordBattleOutcome(save.campaign,0,'ally');
  expect(decodeSave(JSON.stringify(save)).campaign).toEqual(save.campaign);
  expect(save.campaign).toMatchObject({location:1,resumeMap:'local',visited:[0],cleared:[0]});
  expect(save.campaign.areas[0]).toEqual({route:'woods',stage:3,lastOutcome:'ally'});
  expect(suggestedDestination(save.campaign)).toBe(2);
  expect(recordBattleOutcome(save.campaign,0,'ally')).toBe(save.campaign);
 });
 it.each(['enemy','draw'] as const)('remembers a %s outcome without unlocking the road or reversing earlier wins',winner=>{
  const {campaign}=atFort();
  const failed=recordBattleOutcome(campaign,0,winner);
  expect(failed.areas[0].lastOutcome).toBe(winner);
  expect(failed.cleared).toEqual([]);
  expect(suggestedDestination(failed)).toBe(1);
  const revisit=recordBattleOutcome(recordBattleOutcome(campaign,0,'ally'),0,winner);
  expect(revisit.cleared).toEqual([0]);
  expect(revisit.areas[0].lastOutcome).toBe(winner);
 });
 it('only settles the current stronghold after the party arrives',()=>{
  const {campaign}=atFort();
  expect(recordBattleOutcome(campaign,1,'ally')).toBe(campaign);
  campaign.areas[0].stage=2;
  expect(recordBattleOutcome(campaign,0,'ally')).toBe(campaign);
 });
 it('keeps completed expeditions at the visited stronghold',()=>{
  const {campaign}=atFort();
  campaign.cleared=[0,1];
  expect(suggestedDestination(campaign)).toBe(3);
  campaign.cleared=[0,1,2];
  expect(suggestedDestination(campaign)).toBe(1);
 });
 it('resumes older v2 saves on the world map without inventing a past result',()=>{
  const old=JSON.parse(JSON.stringify(atFort()));
  delete old.campaign.resumeMap;
  const restored=decodeSave(JSON.stringify(old)).campaign;
  expect(restored.resumeMap).toBe('world');
  expect(restored.areas[0].lastOutcome).toBeUndefined();
 });
 it('rejects invalid result values and a nonexistent battlefield at camp',()=>{
  const malformed=JSON.parse(JSON.stringify(atFort()));
  malformed.campaign.areas[0].lastOutcome='unknown';
  expect(()=>decodeSave(JSON.stringify(malformed))).toThrow('战果');
  const save=initialSave();
  save.campaign.resumeMap='local';
  expect(()=>decodeSave(JSON.stringify(save))).toThrow('驻地');
 });
});
