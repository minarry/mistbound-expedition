import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const context = await browser.newContext({viewport:{width:1200,height:850},permissions:['clipboard-read','clipboard-write']});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);
  await page.getByRole('button',{name:'菜单',exact:true}).click();
  await page.getByRole('link',{name:'三维工坊'}).click();
  const viewer = page.locator('.atelier-viewport[data-ready=ready]');
  await expect(viewer.locator('canvas')).toBeVisible();
  await page.getByLabel('资产',{exact:true}).selectOption('house');
  await page.getByRole('button',{name:'侧面',exact:true}).click();
  await page.getByLabel('显示线框').check();
  await expect(viewer).toBeVisible();
  const box = await viewer.boundingBox();
  await page.mouse.move(box.x+box.width*.4,box.y+box.height*.6);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*.6,box.y+box.height*.52,{steps:7});
  await page.mouse.up();
  await page.getByRole('button',{name:'复制校样链接'}).click();
  const shared = await page.evaluate(()=>navigator.clipboard.readText());
  const url = new URL(shared);
  assert.equal(url.searchParams.get('asset'),'house');
  assert.equal(url.searchParams.get('camera'),'side');
  assert.equal(url.searchParams.get('wire'),'1');
  assert.equal(url.searchParams.get('orbit').split(',').length,3);
  await page.goto(shared);
  await expect(viewer).toBeVisible();
  await page.getByRole('button',{name:'复位镜头'}).click();
  assert.equal(new URL(page.url()).searchParams.has('orbit'),false);
  const source = await page.getByRole('link',{name:'Mixar 原生工程'}).getAttribute('href');
  const raw = await context.request.get(new URL(source,base).href);
  assert.ok(raw.ok() && (await raw.body()).length>1024,'Mixar 源工程应能下载');
  await page.getByRole('button',{name:'查看校样报告'}).click();
  await expect(page.frameLocator('iframe[title="校样对照"]').getByRole('link',{name:'复现此视图'}).first()).toHaveAttribute('target','_parent');
  await page.getByRole('button',{name:'关闭报告'}).click();
  await page.getByRole('button',{name:'关卡布景'}).click();
  await page.getByLabel('关卡',{exact:true}).selectOption('s03');
  await expect(page.locator('.atelier-map [data-3d-state=ready][data-asset-state=ready]')).toBeVisible();
  await page.getByRole('button',{name:'动作分镜'}).click();
  async function setRange(label, value) {
    const control = page.getByLabel(label,{exact:true});
    await control.press('Home');
    for(let i=0;i<value;i++) await control.press('ArrowRight');
  }
  await setRange('事件帧',8);
  await setRange('动作进度',36);
  const actor = page.locator('canvas[data-battle-models=ready][data-pose-fraction="0.360"]');
  await expect(actor).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  for(const tab of ['模型校样','关卡布景','动作分镜']){
    await page.getByRole('button',{name:tab,exact:true}).click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),tab+' 手机布局');
  }
  assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('shanhe') || k.includes('expedition')).map(k=>[k,JSON.parse(localStorage[k])?.campaign?.started]).filter(([,started])=>started===true)),[]);
  assert.deepEqual(errors,[]);
  console.log('PASS · 正常入口、实际模型、自定义机位分享与复位、原生工程下载、关卡切换、确定性动作定格、手机布局');
} finally { await browser.close(); }
