import React, { lazy, Suspense, useCallback, useEffect, useState, type SetStateAction } from 'react';
import { createRoot } from 'react-dom/client';
import { type Unit, type GameContent } from './core/battle';
import { SAVE_KEY, decodeSave, initialSave, newCampaign, recordBattleOutcome, suggestedDestination, type CampaignMap, type Outcome, type SaveData } from './campaign';
import BattleView from './BattleView';
import Landing from './Landing';
import Story, { introStory, type StoryLine } from './Story';
import WorldMap, { LocalMap } from './WorldMap';
import ContentEditor from './ContentEditor';
import './style.css';
import './app.css';
import './game-frame.css';
const NarrativeCampaign = lazy(() => import('./narrative/NarrativeCampaign'));
type Screen='home'|'world'|'local'|'battle'|'formation'|'editor'|'chronicle';
type EditTab='characters'|'skills'|'levels';
function load(): {data:SaveData;warning:string} {
 try {const raw=localStorage.getItem(SAVE_KEY);return {data:raw?decodeSave(raw):initialSave(),warning:''};}
 catch {return {data:initialSave(),warning:'旧存档无法读取，已使用初始配置。你仍可正常游玩。'};}
}
function App(){
 const [loaded]=useState(load),[save,setSave]=useState(loaded.data),[notice,setNotice]=useState(loaded.warning),[screen,setScreen]=useState<Screen>('home'),[editTab,setEditTab]=useState<EditTab>('characters'),[formationReturn,setFormationReturn]=useState<'world'|'local'>('world'),[story,setStory]=useState<StoryLine[]|null>(null),[storyPreview,setStoryPreview]=useState(false);
 const [worldSelection,setWorldSelection] = useState<number>();
 const {content,campaign}=save; const encounter=Math.max(0,campaign.location-1);
 useEffect(()=>{try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));}catch{setNotice('浏览器存储不可用，本次进度仅在当前页面保留。');}},[save]);
 useEffect(()=>{
  if(!notice) return;
  const timeout=window.setTimeout(()=>setNotice(''),6500);
  return ()=>window.clearTimeout(timeout);
 },[notice]);
 const setTeam=useCallback((next:SetStateAction<Unit[]>)=>setSave(old=>({...old,campaign:{...old.campaign,team:typeof next==='function'?next(old.campaign.team):next}})),[]);
 const onBattleResult=useCallback((winner:Outcome|null)=>{
  if(!winner) return;
  setSave(old=>{
   const next=recordBattleOutcome(old.campaign,encounter,winner);
   return next===old.campaign?old:{...old,campaign:next};
  });
 },[encounter]);
 const nextObjective=content.encounters.find((_,i)=>!campaign.cleared.includes(i))?.name;
 const site=campaign.location===0?'晨星营地':content.encounters[encounter].name;
 const lastStop=campaign.areas[encounter];
 const waypoint=['战场入口',lastStop.route==='woods'?'林间小径':'旧石桥','高地观察点',site][lastStop.stage];
 const continueAt=campaign.resumeMap==='world'?'大地图 · '+site:'战场地图 · '+site+(lastStop.stage===3?' · 据点前沿':' · '+waypoint);
 function showMap(map:CampaignMap) {
  if(map==='world') setWorldSelection(suggestedDestination(campaign));
  setSave(old=>old.campaign.resumeMap===map?old:{...old,campaign:{...old.campaign,resumeMap:map}});
  setScreen(map);
 }
 function resultHint(winner:Outcome) {
  if(winner==='ally') {
   const upcoming=content.encounters.find((_,i)=>i!==encounter&&!campaign.cleared.includes(i));
   return upcoming?site+'已解放。回到大地图，沿道路前往'+upcoming.name+'。':'三处据点均已解放。回到大地图可回访沿途战场。';
  }
  return campaign.cleared.includes(encounter)
   ? '本次复战结束，据点仍已解放。可调整战术再试，或继续远征。'
   : '队伍仍驻在'+site+'前沿。调整阵形或技能条件后可再次推演。';
 }
 const closeStory=useCallback(()=>{setStory(null);if(!storyPreview)setSave(old=>({...old,campaign:{...old.campaign,introSeen:true}}));},[storyPreview]);
 const begin=(restart=false)=>{
  setStoryPreview(false);
  if(restart||!campaign.started){
   setSave(old=>({...old,campaign:{...newCampaign(old.content),started:true}}));
   setWorldSelection(undefined);setStory(introStory);setScreen('world');return;
  }
  if(!campaign.introSeen)setStory(introStory);
  setWorldSelection(suggestedDestination(campaign));
  setScreen(campaign.resumeMap);
 };
 const move=(location:number)=>{
  if(Math.abs(location-campaign.location)!==1||location>1&&!campaign.cleared.includes(location-2))return;
  setSave(old=>({...old,campaign:{...old.campaign,location,visited:location>0?[...new Set([...old.campaign.visited,location-1])]:old.campaign.visited}}));
  if(location>0&&!campaign.visited.includes(location-1)) {setStoryPreview(false);setStory([{speaker:'行军记录 · '+content.encounters[location-1].subtitle,title:content.encounters[location-1].name,text:content.encounters[location-1].detail+' 进入战场地图后选择行军路线，抵达据点即可推演。'}]);}
 };
 const openFormation=(from:CampaignMap,selected?:number)=>{
  if(from==='world')setWorldSelection(selected);
  setFormationReturn(from);setScreen('formation');
 };
 const saveContent=(next:GameContent)=>{setSave({version:2,content:next,campaign:newCampaign(next)});setScreen('home');setNotice('工坊设置已保存，下次远征将从营地出发。');};
 return <><div className="game-layer" data-screen={screen} inert={!!story}>{screen==='home'&&<Landing hasSave={campaign.started} continueAt={continueAt} cleared={campaign.cleared.length} onStart={()=>begin()} onRestart={()=>begin(true)} onEdit={tab=>{setEditTab(tab);setScreen('editor');}} onStory={()=>{setStoryPreview(true);setStory(introStory);}} onChronicle={()=>setScreen('chronicle')}/>}
 {screen==='chronicle'&&<Suspense fallback={<div className="sh-loading">正在展开山河行记…</div>}><NarrativeCampaign onHome={()=>setScreen('home')}/></Suspense>}
 {screen==='editor'&&<ContentEditor content={content} initialTab={editTab} onSave={saveContent} onClose={()=>setScreen('home')}/>}
 {screen==='world'&&<WorldMap initialSelection={worldSelection} encounters={content.encounters} team={campaign.team} location={campaign.location} cleared={campaign.cleared} onMove={move} onEnter={index=>{if(campaign.location===index+1)showMap('local');}} onFormation={selected=>openFormation('world',selected)} onHome={()=>setScreen('home')}/>}
 {screen==='local'&&<LocalMap key={encounter} progress={lastStop} lastOutcome={lastStop.lastOutcome} nextObjective={nextObjective} onProgress={next=>setSave(old=>({...old,campaign:{...old.campaign,areas:old.campaign.areas.map((a,i)=>i===encounter?{...a,...next}:a)}}))} encounter={content.encounters[encounter]} index={encounter} cleared={campaign.cleared.includes(encounter)} onBattle={()=>setScreen('battle')} onBack={()=>showMap('world')} onFormation={()=>openFormation('local')}/>}
 {(screen==='battle'||screen==='formation')&&<BattleView key={screen} content={content} team={campaign.team} setTeam={setTeam} encounter={encounter} mode={screen==='formation'?'formation':'battle'} onResult={onBattleResult} returnToWorldOnWin onWorld={()=>showMap('world')} resultHint={resultHint} originLabel={screen==='formation'&&formationReturn==='world'?'大地图':'战场地图'} siteLabel={site} onBack={()=>setScreen(screen==='formation'?formationReturn:'local')}/>}
 {notice&&<div className="app-notice" role="status">{notice}</div>}
 </div>{story&&<Story key={story[0].title} lines={story} exitLabel={storyPreview?'返回主菜单':story===introStory?'进入大地图':'返回大地图'} onClose={closeStory}/>}
 </>;
}
const Atelier = lazy(() => import('./atelier/Atelier'));
const page = new URLSearchParams(location.search).has('lab')
  ? <div className="game-layer" data-screen="atelier"><Suspense fallback={<p className="game-loading" role="status">正在打开三维工坊…</p>}><Atelier/></Suspense></div> : <App/>;
createRoot(document.getElementById('root')!).render(<React.StrictMode><div className="game-frame" role="region" aria-label="雾境远征游戏视窗">{page}</div></React.StrictMode>);
