// Capture the production renderers in a clean browser context. Paths are relative to this Web project.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { createDefaultContent, simulate } from '../src/core/battle.ts';
const root = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {values} = parseArgs({options:{out:{type:'string'},url:{type:'string'},baseline:{type:'string'}}});
const out = resolve(root, values.out || '.local/reviews/'+new Date().toISOString().replace(/:/g,'-'));
const base = values.url || process.env.GAME_URL || 'http://127.0.0.1:5173';
const baseline = values.baseline ? resolve(root,values.baseline) : null;
await mkdir(out, {recursive:true});
try { await access(join(out,'report.json')); throw Error('已有校样，请选择新的 --out 目录'); }
catch (e) { if (e.code!=='ENOENT') throw e; }
const prior = baseline ? JSON.parse(await readFile(join(baseline,'report.json'),'utf8')) : null;
const response = await fetch(new URL('/atelier/manifest.json',base));
assert.ok(response.ok,'找不到资产清单');
const manifest = await response.json();
assert.equal(manifest.assets.length,9);
async function fingerprint(path) {
  const r = await fetch(new URL(path,base),{cache:'no-store'});
  assert.ok(r.ok,path);
  return createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');
}
const sources = {};
for (const path of [manifest.nativeSource,manifest.source,manifest.script].filter(Boolean)) sources[path] = await fingerprint(path);
const hashes = {};
for (const a of manifest.assets) {
  for(const path of [a.blockout,a.model]){
    const r = await fetch(new URL(path,base));
    assert.ok(r.ok,path);
    const data = Buffer.from(await r.arrayBuffer());
    assert.equal(data.toString('ascii',0,4),'glTF');
    assert.equal(data.readUInt32LE(8),data.length);
    hashes[path] = createHash('sha256').update(data).digest('hex');
  }
}
const browser = await chromium.launch({channel:process.env.CHROME_CHANNEL || 'chrome',headless:true,
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--disable-dev-shm-usage']});
const viewport = {width:1240,height:850};
const page = await browser.newPage({viewport,deviceScaleFactor:1,reducedMotion:'reduce'});
const errors = [];
page.on('pageerror',e=>errors.push(e.message));
const shots = [];
const data = createDefaultContent();
const {frames} = simulate(data.squad,data.encounters[0].units,data);
async function shot(id,title,query,ready,area,detail = {}) {
  const path = '/?'+new URLSearchParams(query);
  await page.goto(new URL(path,base).href,{waitUntil:'domcontentloaded'});
  await page.locator(ready).first().waitFor({timeout:45000});
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  const box = await page.locator(area).first().boundingBox();
  assert.ok(box && box.width>200 && box.height>120,'截图区域无有效大小');
  const filename = id+'.png';
  const pixels = await page.locator(area).first().screenshot({path:join(out,filename),animations:'allow'});
  shots.push({id,title,filename,path,width:Math.round(box.width),height:Math.round(box.height),
    sha256:createHash('sha256').update(pixels).digest('hex'),...detail});
  console.log(title);
}
try {
  for (const asset of manifest.assets) {
    await shot('asset-'+asset.id,asset.label,{lab:'assets',asset:asset.id,stage:'compare',camera:'quarter'},
      '.atelier-viewport[data-ready=ready] canvas','.atelier-viewport',
      {asset:asset.id,triangles:asset.triangles,materials:asset.materials,size:asset.size});
  }
  await shot('mesh-house','民居 · 侧面线框',{lab:'assets',asset:'house',stage:'final',camera:'side',wire:'1'},
    '.atelier-viewport[data-ready=ready] canvas','.atelier-viewport');
  for (const [level,name] of [['s01','湘赣丘陵'],['s03','芦溪河岸'],['s06','茨坪山地']]) {
    await shot('map-'+level,name,{lab:'map',level},'[data-3d-state=ready][data-asset-state=ready] canvas','.atelier-map');
  }
  for (const [effect,pose] of [['pierce',.25],['pierce',.65],['cover',.55],['heal',.65]]) {
    const index = frames.findIndex(f=>f.action?.effect===effect);
    assert.ok(index>0,'缺少动作 '+effect);
    const f = frames[index];
    await shot('battle-'+effect+'-'+Math.round(pose*100),f.action.label+' · '+Math.round(pose*100)+'%',
      {lab:'battle',frame:String(index),pose:String(pose)},
      'canvas[data-battle-renderer=ready][data-battle-models=ready]','.atelier-battle',
      {frame:index,pose,actor:f.actor,target:f.target,effect,text:f.text});
  }
  assert.deepEqual(errors,[],'浏览器发生错误');
  for (const [path,sha] of Object.entries({...hashes,...sources})) assert.equal(await fingerprint(path),sha,'复拍期间文件有改动：'+path);
  const report = {authoring:manifest.authoring,baseline:baseline ? relative(out,baseline) : null,version:manifest.version,createdAt:new Date().toISOString(),browser:browser.version(),viewport,hashes,sources,shots};
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
} finally { await browser.close(); }
const escape = text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const cards = shots.map(s=>{
  const before = prior?.shots.find(old=>old.id===s.id);
  const prevPath = before ? relative(out,join(baseline,before.filename)) : '';
  return '<article><h2>'+escape(s.title)+'</h2><div class="imgs">'+(before?'<figure><figcaption>上一版</figcaption><img src="'+escape(prevPath)+'"></figure>':'')+
    '<figure><figcaption>'+ (before?'本次校样':'固定机位') +'</figcaption><img src="'+escape(s.filename)+'" alt="'+escape(s.title)+'"></figure></div><p>'+
    (s.text?escape(s.text)+' · ':'')+(s.triangles?s.triangles+' 三角面 · ':'')+s.width+' × '+s.height+
    (before?' · '+(s.sha256===before.sha256?'画面一致':'画面已变化'):'')+' · <a href="'+escape(s.path)+'">复现此视图</a></p></article>';
}).join('\n');
const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>雾境远征 · 三维校样</title><style>*{box-sizing:border-box}body{margin:auto;max-width:1450px;background:#14201c;color:#e5e5d6;padding:32px 4%;font:15px/1.5 system-ui}h1,h2{font-family:serif}a{color:#dfc797}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(450px,100%),1fr));gap:16px}article{padding:12px;background:#1e2d26;border:1px solid #47544b}h2{margin:2px 0 8px;font-size:19px}.imgs{display:flex;gap:8px}figure{flex:1;min-width:0;margin:0}figcaption,p{font-size:13px}img{width:100%;margin-top:4px}</style><a href="/?lab=assets">← 三维工坊</a><h1>三维校样</h1><p>'+shots.length+' 张固定镜头 · <a href="report.json">查看模型指纹、事件与复拍参数</a></p><main>'+cards+'</main></html>';
// Reports under public/ use their current origin. Opening a local report uses the selected live game.
const fileLinks = '<script>if(location.protocol==="file:"){for(const a of document.querySelectorAll("a[href^=\'/\']"))a.href=new URL(a.getAttribute("href"),'+JSON.stringify(new URL(base).origin)+').href}</script>';
await writeFile(join(out,'index.html'),html.replace('</html>',fileLinks+'</html>'));
console.log('已生成',join(out,'index.html'));
