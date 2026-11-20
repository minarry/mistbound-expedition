import { useCallback, useEffect, useRef, useState } from 'react';
import { AssetViewer, type Asset, type CameraView, type Stage } from './AssetViewer';
import { storyBook } from '../narrative/book';
import StoryMap from '../narrative/StoryMap';
import BattleStage from '../BattleStage';
import { createDefaultContent, simulate } from '../core/battle';
import './atelier.css';

interface Manifest { version:string; source:string; nativeSource?:string; script:string; authoring:{application:string;version:string}; assets:Asset[] }
const content = createDefaultContent();
const battle = simulate(content.squad, content.encounters[0].units, content);
const tabs = {assets:'模型校样',map:'关卡布景',battle:'动作分镜'} as const;
const angles: Record<CameraView,string> = {quarter:'四分之三',front:'正面',side:'侧面',top:'俯视'};
const stages: Record<Stage,string> = {compare:'并排对照',blockout:'灰模',final:'成品'};
const pick = <T extends string>(value:string|null, values:Record<T,string>, fallback:T) =>
  value && Object.hasOwn(values,value) ? value as T : fallback;
function bounded(value:string|null, fallback:number, max:number) {
  return value!==null && Number.isFinite(Number(value)) ? Math.max(0,Math.min(max,Number(value))) : fallback;
}
function Selector<T extends string>({label, value, options, change}:{
  label:string; value:T; options:Record<T,string>; change:(key:T)=>void;
}) {
  return <fieldset className="atelier-segments"><legend>{label}</legend><div>{(Object.keys(options) as T[]).map(k=>
    <button key={k} type="button" aria-pressed={k===value} onClick={()=>change(k)}>{options[k]}</button>)}</div></fieldset>;
}

export default function Atelier() {
  const [reportOpen,setReportOpen] = useState(false);
  const reportTrigger = useRef<HTMLButtonElement>(null);
  const closeReport = () => { setReportOpen(false); requestAnimationFrame(()=>reportTrigger.current?.focus()); };
  const [toolsOpen,setToolsOpen] = useState(()=>!window.matchMedia('(max-width: 760px)').matches);
  const [params,setParams] = useState(()=>new URLSearchParams(location.search));
  const orbit = useRef('');
  const recordOrbit = useCallback((value:string)=>{orbit.current=value;},[]);
  const update = (values:Record<string,string>) => {
    const next = new URLSearchParams(params);
    for(const [k,v] of Object.entries(values)) next.set(k,v);
    if (values.camera || values.asset) next.delete('orbit');
    else if (orbit.current && params.get('lab')==='assets') next.set('orbit',orbit.current);
    window.history.replaceState(null,'',location.pathname+'?'+next.toString());
    setParams(next);
  };
  const tab = pick<keyof typeof tabs>(params.get('lab'),tabs,'assets');
  const [manifest,setManifest] = useState<Manifest>();
  const [loadError,setLoadError] = useState(false);
  const [reset,setReset] = useState(0);
  const [copyLabel,setCopyLabel] = useState('');
  useEffect(()=>{
    const abort = new AbortController();
    fetch('/atelier/manifest.json',{signal:abort.signal}).then(r=>{
      if(!r.ok) throw Error('manifest');
      return r.json() as Promise<Manifest>;
    }).then(m=>{if (!m.assets?.length) throw Error('empty'); setManifest(m);})
      .catch(()=>{if(!abort.signal.aborted)setLoadError(true);});
    return ()=>abort.abort();
  },[]);
  const asset = manifest?.assets.find(a=>a.id===params.get('asset')) ?? manifest?.assets[0];
  const angle = pick<CameraView>(params.get('camera'),angles,'quarter'), stage = pick<Stage>(params.get('stage'),stages,'compare');
  const wire = params.get('wire')==='1';
  const level = storyBook.levels.find(l=>l.id===params.get('level')) ?? storyBook.levels[0];
  const node = level.nodes.find(n=>n.id===params.get('node')) ?? level.nodes.find(n=>n.id===level.entry)!;
  const index = Math.round(bounded(params.get('frame'),1,battle.frames.length-1)), frame = battle.frames[index];
  const pose = bounded(params.get('pose'),.55,1);
  const effects = battle.frames.flatMap((f,i)=>f.action && battle.frames.findIndex(other=>other.action?.effect===f.action!.effect)===i?[{index:i,label:f.action.label}]:[]);
  const caption = tab==='assets'?asset?.label:tab==='map'?level.title:frame.action?.label ?? '战斗推演';
  async function copy() {
    const url = new URL(location.href);
    if(tab==='assets' && orbit.current) url.searchParams.set('orbit',orbit.current);
    try {await navigator.clipboard.writeText(url.href); setCopyLabel('已复制当前地址');}
    catch {setCopyLabel(url.href);}
  }
  return <main className="atelier" data-tools={toolsOpen?'open':'closed'}>
    <header className="atelier-bar" inert={reportOpen}><a href="/" aria-label="返回游戏">← 返回</a><h1>三维工坊</h1><nav aria-label="工坊视图">{(Object.keys(tabs) as (keyof typeof tabs)[]).map(k=><button key={k} aria-current={k===tab?'page':undefined} onClick={()=>update({lab:k})}>{tabs[k]}</button>)}</nav>
      <button className="atelier-toggle" aria-expanded={toolsOpen} aria-controls="atelier-tools" onClick={()=>setToolsOpen(v=>!v)}>调试参数</button>
    </header>
    <div className="atelier-layout" inert={reportOpen}><section className="atelier-board"><header><div><small>{tabs[tab]}</small><h2>{caption||'资产目录'}</h2></div><code>{tab==='assets'?asset?.id:tab==='map'?level.id:'F '+String(index).padStart(3,'0')}</code></header>
    {tab==='assets' && (asset ? <AssetViewer asset={asset} cameraView={angle} stage={stage} wire={wire} reset={reset} savedOrbit={params.get('orbit')} onOrbit={recordOrbit}/> : <p role="status">{loadError?'资产清单读取失败，请刷新重试。':'正在读取资产目录…'}</p>)}
    {tab==='map' && <div className="atelier-map" data-review-shot="map"><StoryMap level={level} current={node.id} selected={node.id} completed={[]} onSelect={id=>update({node:id})}/></div>}
    {tab==='battle' && <div className="atelier-battle" data-review-shot="battle"><BattleStage frame={frame} previousFrame={battle.frames[index-1]} step={index} content={content} duration={1200} playing={false} poseFraction={pose} replay={0}/></div>}
    <footer>{tab==='assets'?'拖动旋转模型，滚轮缩放。两侧模型共用镜头和灯光。':tab==='map'?level.map.routeNote:frame.text}</footer></section>
    <aside className="atelier-tools" id="atelier-tools" aria-label="调试参数" hidden={!toolsOpen}>
    {tab==='assets' && asset && <>
      <label>资产<select aria-label="资产" value={asset.id} onChange={e=>update({asset:e.target.value})}>{manifest!.assets.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
      <Selector label="制作阶段" value={stage} options={stages} change={v=>update({stage:v})}/>
      <Selector label="固定机位" value={angle} options={angles} change={v=>{setReset(r=>r+1);update({camera:v});}}/>
      <div className="atelier-controls"><label><input type="checkbox" checked={wire} onChange={e=>update({wire:e.target.checked?'1':'0'})}/> 显示线框</label><button onClick={()=>{setReset(r=>r+1);update({camera:angle});}}>复位镜头</button></div>
      <dl><dt>制作工具</dt><dd>{manifest!.authoring.application} {manifest!.authoring.version}</dd><dt>三角面</dt><dd>{asset.triangles.toLocaleString()}</dd><dt>宽 × 高 × 深</dt><dd>{asset.size.map(n=>n.toFixed(2)).join(' × ')} m</dd><dt>材质</dt><dd>{asset.materials.length} 种</dd></dl>
      <div className="atelier-links"><a href={asset.blockout} download>灰模 GLB ↓</a><a href={asset.model} download>成品 GLB ↓</a><a href={manifest!.nativeSource||manifest!.source} download>Mixar 原生工程 ↓</a><a href={manifest!.source} download>BLEND 工程 ↓</a><a href={manifest!.script} download>建模脚本 ↓</a><a href="/atelier/manifest.json" download>资产清单 ↓</a></div>
    </>}
    {tab==='map' && <><label>关卡<select aria-label="关卡" value={level.id} onChange={e=>update({level:e.target.value,node:''})}>{storyBook.levels.map(l=><option key={l.id} value={l.id}>{l.title}</option>)}</select></label><label>聚焦节点<select aria-label="聚焦节点" value={node.id} onChange={e=>update({node:e.target.value})}>{level.nodes.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label><h3>{node.name}</h3><p>{node.objective}</p><dl><dt>路线</dt><dd>{level.nodes.length} 节点 · {level.edges.length} 路段</dd><dt>布景</dt><dd>{level.style.lighting}</dd></dl></>}
    {tab==='battle' && <><label>事件帧 <output>{index} / {battle.frames.length-1}</output><input type="range" aria-label="事件帧" min="0" max={battle.frames.length-1} value={index} onChange={e=>update({frame:e.target.value})}/></label>
      <div className="atelier-controls"><button disabled={index===0} onClick={()=>update({frame:String(index-1)})}>上一帧</button><button disabled={index===battle.frames.length-1} onClick={()=>update({frame:String(index+1)})}>下一帧</button></div>
      <label>动作进度 <output>{Math.round(pose*100)}%</output><input type="range" aria-label="动作进度" min="0" max="100" value={Math.round(pose*100)} onChange={e=>update({pose:String(Number(e.target.value)/100)})}/></label>
      <h3>定位技能</h3><div className="atelier-effects">{effects.map(e=><button key={e.index} onClick={()=>update({frame:String(e.index)})}>{e.label}</button>)}</div>
      <dl><dt>施动角色</dt><dd>{frame.units.find(u=>u.id===frame.actor)?.name??'—'}</dd><dt>目标角色</dt><dd>{frame.units.find(u=>u.id===frame.target)?.name??'—'}</dd></dl></>}
    <button ref={reportTrigger} onClick={()=>setReportOpen(true)}>查看校样报告</button><button onClick={copy}>复制校样链接</button><small role="status">{copyLabel}</small>
    </aside></div>
    {reportOpen && <div className="atelier-proof" role="dialog" aria-modal="true" aria-label="三维校样报告" onKeyDown={e=>{if(e.key==='Escape')closeReport();}}>
      <div className="atelier-proof-bar"><h2>校样报告</h2><button autoFocus onClick={closeReport}>关闭报告</button></div>
      <iframe src="/atelier/reviews/field-v1/index.html" title="校样对照" onLoad={event=>{
        const doc = event.currentTarget.contentDocument;
        if (!doc) return;
        for(const link of doc.querySelectorAll<HTMLAnchorElement>('a[href^="/?"]')) link.target='_parent';
        doc.querySelector('a[href="report.json"]')?.setAttribute('download','report.json');
        doc.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeReport();}});
      }}/>
    </div>}
  </main>;
}
