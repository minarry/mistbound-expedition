import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createDefaultContent, simulate, unit } from '../src/core/battle.ts';
const browser=await chromium.launch({channel:'chrome',headless:true,args:process.env.WEBGL_TEST?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--disable-gpu']});
const url=process.env.GAME_URL||'http://127.0.0.1:5173';
const errors=[];
const context=await browser.newContext({viewport:{width:1440,height:1100}});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const content=createDefaultContent();
const save={version:2,content,campaign:{started:true,introSeen:true,team:content.squad,location:1,cleared:[],visited:[0],areas:[{route:'bridge',stage:3},{route:'bridge',stage:0},{route:'bridge',stage:0}]}};
await page.addInitScript(save=>{if(!localStorage.getItem('feedback-test-seeded')){localStorage.setItem('mistbound.expedition.v2',JSON.stringify(save));localStorage.setItem('feedback-test-seeded','1');}},save);
const battle=simulate(content.squad,content.encounters[0].units,content);
async function seek(index){
 await page.getByLabel('战斗时间轴',{exact:true}).evaluate((element,index)=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(element,String(index));element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));},index);
 await expect(page.getByTestId('battle-stage')).toHaveAttribute('data-step',String(index));
}
async function assertFrame(frame){
 await expect(page.getByTestId('action-actor')).toHaveText(frame.units.find(u=>u.id===frame.actor).name);
 await expect(page.getByTestId('action-target')).toHaveText(frame.units.find(u=>u.id===frame.target).name);
 await expect(page.getByTestId('action-skill')).toHaveText(frame.action.label);
 await expect(page.getByTestId('skill-effect')).toHaveAttribute('data-effect',frame.action.effect);
 await expect(page.locator(`.bs-unit[data-unit-id="${frame.actor}"]`)).toHaveAttribute('data-actor','true');
 await expect(page.locator(`.bs-unit[data-unit-id="${frame.target}"]`)).toHaveAttribute('data-target','true');
 if(frame.action.effect!=='cover')await expect(page.getByTestId('action-amount')).toContainText(String(frame.action.amount));
 for(const u of frame.units)await expect(page.locator(`.bs-unit[data-unit-id="${u.id}"]`)).toHaveAttribute('data-hp',String(u.hp));
}
try{
 await page.goto(url);await page.getByRole('button',{name:/继续远征/}).click();await page.getByRole('button',{name:/进入战场地图/}).click();await page.getByRole('button',{name:/启动战斗推演/}).click();await page.getByRole('button',{name:'暂停回放',exact:true}).click();
 // A paused encounter can leave and restart at the same battlefield without recording an outcome.
 await page.getByRole('button',{name:'返回战场地图',exact:true}).click();
 const retreat=page.getByRole('dialog',{name:'撤回战场地图？'});
 await expect(retreat).toBeVisible();
 await retreat.getByRole('button',{name:'继续推演'}).click();
 await expect(page.getByRole('button',{name:'继续回放',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'返回战场地图',exact:true}).click();
 await retreat.getByRole('button',{name:'撤回战场地图',exact:true}).click();
 const afterRetreat=await page.evaluate(()=>JSON.parse(localStorage.getItem('mistbound.expedition.v2')).campaign);
 assert.equal(afterRetreat.location,1);
 assert.equal(afterRetreat.areas[0].stage,3);
 assert.equal(afterRetreat.areas[0].lastOutcome,undefined);
 assert.deepEqual(afterRetreat.cleared,[]);
 await page.getByRole('button',{name:/启动战斗推演/}).click();
 await page.getByRole('button',{name:'暂停回放',exact:true}).click();
 for(const effect of ['strike','heavy','pierce','heal','cover','counter','followup','blessing']){
  const index=battle.frames.findIndex(f=>f.action?.effect===effect);assert.ok(index>=0,`${effect} fixture exists`);await seek(index);await assertFrame(battle.frames[index]);
 }
 const index=battle.frames.findIndex(f=>f.action?.effect==='pierce');await seek(index);
 const frozen=await page.getByTestId('battle-stage').getAttribute('data-step');
 await page.waitForTimeout(2100);
 assert.equal(await page.getByTestId('battle-stage').getAttribute('data-step'),frozen);
 await page.getByRole('button',{name:'单步',exact:true}).click();await expect(page.getByTestId('battle-stage')).toHaveAttribute('data-step',String(index+1));
 await page.getByRole('button',{name:'上一事件',exact:true}).click();await assertFrame(battle.frames[index]);
 await page.getByLabel('回放速度',{exact:true}).selectOption('3000');
 await page.getByRole('button',{name:'继续回放',exact:true}).click();
 await page.waitForTimeout(120);
 await page.getByRole('button',{name:'暂停回放',exact:true}).click();
 // CSS pause commits on the animation timeline's next update, after the click handler.
 // Measure only once that pending transition is ready, then require a frozen clock.
 const animationTime=()=>page.locator('.bs-trajectory').evaluate(async el=>{const animation=el.getAnimations()[0];if(!animation)throw new Error('trajectory animation missing');await animation.ready;return animation.currentTime;});
 await expect(page.getByTestId('battle-stage')).toHaveAttribute('data-playing','false');
 const pausedTime=await animationTime();
 assert.equal(await page.locator('.bs-trajectory').evaluate(el=>el.getAnimations()[0].playState),'paused');
 await page.waitForTimeout(350);
 assert.ok(Math.abs((await animationTime())-pausedTime)<2,'effect animation must freeze when paused');
 await page.getByRole('button',{name:'继续回放',exact:true}).click();
 await page.waitForTimeout(100);
 assert.ok((await animationTime())>pausedTime,'effect animation must resume without restarting');

 await page.screenshot({path:'e2e/feedback-motion-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'暂停回放',exact:true}).click();
 await seek(battle.frames.findIndex(f=>f.action?.effect==='heavy'));
 await page.screenshot({path:'e2e/feedback-desktop.png',fullPage:true});
 await page.getByTestId('battle-stage').screenshot({path:'e2e/battle-stage-preview.png'});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'e2e/feedback-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'战斗日志',exact:true}).click();
 await expect(page.getByRole('complementary',{name:'战斗日志'})).toBeVisible();
 await page.locator('.bs-log-jump').first().click();
 await expect(page.getByRole('complementary',{name:'战斗日志'})).toHaveCount(0);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:1440,height:1100});
 const coverIndex=battle.frames.findIndex(f=>f.action?.effect==='cover');await seek(coverIndex);await page.screenshot({path:'e2e/feedback-cover.png',fullPage:true});
 await seek(coverIndex+1);assert.ok(battle.frames[coverIndex+1].action.redirectedFrom);await expect(page.locator('.bs-action-note')).toContainText('伤害转移');
 const dead=battle.frames.findIndex(f=>f.action && f.units.find(u=>u.id===f.target)?.hp===0);assert.ok(dead>0);await seek(dead);await expect(page.locator(`.bs-unit[data-unit-id="${battle.frames[dead].target}"]`)).toHaveClass(/bs-down/);await seek(dead-1);await expect(page.locator(`.bs-unit[data-unit-id="${battle.frames[dead].target}"]`)).not.toHaveClass(/bs-down/);
 await page.emulateMedia({reducedMotion:'reduce'});await seek(index);await assertFrame(battle.frames[index]);await page.emulateMedia({reducedMotion:'no-preference'});

 // Jump out of an in-progress death animation: settled casualties must be lying down.
 await seek(dead-1);await page.getByLabel('回放速度',{exact:true}).selectOption('900');await page.getByRole('button',{name:'继续回放',exact:true}).click();
 await expect(page.getByTestId('battle-stage')).toHaveAttribute('data-step',String(dead));
 await page.getByRole('button',{name:'查看战果',exact:true}).click();
 for(const id of battle.frames.at(-1).units.filter(u=>u.hp===0).map(u=>u.id)){
  const time=await page.locator(`.bs-unit[data-unit-id="${id}"] .cha-figure`).evaluate(el=>{const animation=el.getAnimations()[0];return animation?Number(animation.currentTime)/Number(animation.effect.getTiming().duration):1;});
  assert.ok(time>=.99,'settled fallen actor must show completed collapse');
 }
 await expect(page.getByTestId('skill-effect')).toHaveCount(0);await expect(page.locator('.bs-floating')).toHaveCount(0);await expect(page.locator('.battle-message')).toContainText('胜利');
 const result=page.getByTestId('battle-result');
 async function expectPrimaryReturn(label){
  const routes=result.locator('.report-routes button');
  await expect(routes).toHaveCount(2);
  await expect(routes.first()).toHaveAccessibleName(label);
  await expect(routes.first()).toHaveClass(/hud-primary/);
  await expect(routes.first()).toBeFocused();
  await expect(routes.last()).not.toHaveClass(/hud-primary/);
 }
 await expect(result.getByRole('heading',{name:'战斗胜利'})).toBeVisible();
 await expectPrimaryReturn('返回大地图');
 const savedWin=await page.evaluate(()=>localStorage.getItem('mistbound.expedition.v2'));
 assert.equal(JSON.parse(savedWin).campaign.areas[0].lastOutcome,'ally');
 for(const [width,height] of [[1440,960],[390,844],[320,568],[568,320]]){
  await page.setViewportSize({width,height});
  const hidden=await result.locator('button').evaluateAll(buttons=>buttons.filter(b=>{
   const r=b.getBoundingClientRect();return !b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
  }).map(b=>b.textContent));
  assert.deepEqual(hidden,[],'战果操作可直接点击 '+width+'×'+height);
  if(width===1440||width===390)await page.screenshot({path:'e2e/battle-result-'+(width===1440?'desktop':'mobile')+'.png'});
 }
 await page.setViewportSize({width:1440,height:960});
 await result.getByRole('button',{name:'战斗日志'}).click();
 await expect(page.getByRole('complementary',{name:'战斗日志'})).toBeVisible();
 await page.locator('.bs-log-jump').last().click();
 await expect(page.getByTestId('battle-stage')).toHaveAttribute('data-step','0');
 await page.getByRole('button',{name:'返回战果'}).click();
 await result.getByRole('button',{name:'回看本场'}).click();
 await page.getByRole('button',{name:'暂停回放',exact:true}).click();
 await seek(0);
 for(const u of content.squad)await expect(page.locator('.bs-unit[data-unit-id="'+u.id+'"]')).toHaveAttribute('data-hp',String(content.jobs[u.job].hp));
 // Playing the last event of an archived replay returns to the existing result, without awarding a second win.
 await seek(battle.frames.length-2);
 await page.getByRole('button',{name:'继续回放',exact:true}).click();
 await expect(result).toBeVisible();
 assert.equal(await page.evaluate(()=>localStorage.getItem('mistbound.expedition.v2')),savedWin);
 await result.getByRole('button',{name:'调整编队再战'}).click();
 await expect(page.getByTestId('battle-stage')).toHaveCount(0);
 if(process.env.WEBGL_TEST)await expect(page.locator('.formation canvas')).toHaveAttribute('data-battle-models','ready');
 await page.locator('.tactical-screen').screenshot({path:'e2e/formation-hud.png'});
 await page.getByRole('button',{name:'编辑战术',exact:true}).click();await expect(page.getByLabel('角色职业',{exact:true})).toBeEnabled();
 await page.locator('.tactical-screen').screenshot({path:'e2e/formation-hud-orders.png'});
 await page.locator('.tactical-sheet').press('Escape');
 await expect(page.getByRole('button',{name:'编辑战术',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'侦察敌方',exact:true}).click();
 await expect(page.getByRole('button',{name:/^敌方前排/}).first()).toBeDisabled();
 await page.getByRole('button',{name:'查看我方',exact:true}).click();

 // Six characters on each side exercise every formation slot, including narrow screens.
 const crowded=createDefaultContent();
 crowded.squad.push(unit('a5','余辉','sword',2),unit('a6','磐石','guard',4));
 crowded.encounters[0].units.push(unit('e4','斥候乙','bow',2),unit('e5','祭司','priest',4),unit('e6','剑客乙','sword',5));
 const crowdedSave={...save,content:crowded,campaign:{...save.campaign,team:crowded.squad}};
 await page.evaluate(s=>localStorage.setItem('mistbound.expedition.v2',JSON.stringify(s)),crowdedSave);
 await page.reload();await page.getByRole('button',{name:/继续远征/}).click();await page.getByRole('button',{name:/进入战场地图/}).click();await page.getByRole('button',{name:/启动战斗推演/}).click();await page.getByRole('button',{name:'暂停回放',exact:true}).click();
 for(const [width,height] of [[320,568],[390,844],[600,800],[900,1000],[844,390],[568,320]]){
  await page.setViewportSize({width,height});
  const blocked=await page.locator('.tactical-screen').evaluate(screen=>{
    const box=screen.getBoundingClientRect();
    const widgets=screen.querySelectorAll('.tactical-dock button:enabled,.tactical-dock input,.tactical-dock select,.tactical-back');
    return [...widgets].filter(w=>{const r=w.getBoundingClientRect();const center=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !w.contains(center)||r.top<box.top-1||r.bottom>box.bottom+1||r.left<box.left-1||r.right>box.right+1;}).map(w=>w.textContent);
  });
  assert.deepEqual(blocked,[],'战斗控件在画面内可点 '+width+'×'+height);
  const boxes=await page.locator('.bs-unit-info').evaluateAll(elements=>elements.map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,`formation labels must not overlap at ${width}px`);}
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'e2e/feedback-full-party-mobile.png',fullPage:true});

 const solo=createDefaultContent();solo.squad=[unit('solo','暮光','priest',0)];solo.encounters[0].units=[unit('foe','铁卫','guard',0)];
 const soloBattle=simulate(solo.squad,solo.encounters[0].units,solo);
 const selfHeal=soloBattle.frames.findIndex(f=>f.action?.effect==='heal'&&f.actor===f.target);assert.ok(selfHeal>=0);
 await page.evaluate(s=>localStorage.setItem('mistbound.expedition.v2',JSON.stringify(s)),{...save,content:solo,campaign:{...save.campaign,team:solo.squad}});
 await page.reload();await page.getByRole('button',{name:/继续远征/}).click();await page.getByRole('button',{name:/进入战场地图/}).click();await page.getByRole('button',{name:/启动战斗推演/}).click();await page.getByRole('button',{name:'暂停回放',exact:true}).click();
 await seek(selfHeal);await assertFrame(soloBattle.frames[selfHeal]);await expect(page.locator('.bs-role-tag')).toContainText('自我治疗');await expect(page.locator('.bs-floating')).toContainText('+');
 await seek(soloBattle.frames.length-2);
 await page.getByRole('button',{name:'继续回放',exact:true}).click();
 await expect(result.getByRole('heading',{name:'战斗僵持'})).toBeVisible();
 await expectPrimaryReturn('返回战场地图');
 await result.getByRole('button',{name:'返回大地图'}).click();
 await expect(page.locator('.world-screen:not(.local-screen)')).toBeVisible();
 const drawn = await page.evaluate(()=>JSON.parse(localStorage.getItem('mistbound.expedition.v2')).campaign);
 assert.equal(drawn.areas[0].lastOutcome,'draw');assert.deepEqual(drawn.cleared,[]);
 const losing=createDefaultContent();losing.squad.forEach(u=>u.rules=[]);
 await page.evaluate(s=>localStorage.setItem('mistbound.expedition.v2',JSON.stringify(s)),{...save,content:losing,campaign:{...save.campaign,team:losing.squad}});
 await page.reload();await page.getByRole('button',{name:/继续远征/}).click();await page.getByRole('button',{name:/进入战场地图/}).click();await page.getByRole('button',{name:/启动战斗推演/}).click();
 await page.getByRole('button',{name:'查看战果'}).click();await expect(result.getByRole('heading',{name:'战斗失利'})).toBeVisible();
 await expectPrimaryReturn('返回战场地图');
 await result.getByRole('button',{name:'返回战场地图'}).click();await expect(page.locator('.local-screen')).toBeVisible();
 const lost=await page.evaluate(()=>JSON.parse(localStorage.getItem('mistbound.expedition.v2')).campaign);
 assert.deepEqual(lost.cleared,[]);assert.equal(lost.areas[0].lastOutcome,'enemy');assert.equal(lost.location,1);
 assert.deepEqual(errors,[]);
 console.log('PASS: retreat without settlement, victory/defeat/draw, both return routes, replay without duplicate settlement, formation retry, eight battle effects and responsive controls');
}finally{await browser.close();}
