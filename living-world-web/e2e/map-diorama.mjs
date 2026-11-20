import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const url = process.env.GAME_URL || 'http://127.0.0.1:5173/';
const capture = process.argv.includes('--capture');
const browser = await chromium.launch({
  channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({viewport:{width:1440,height:960}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));

async function scene(container, name) {
  const layer = page.locator(container).locator('.map-diorama');
  await layer.evaluate(element => element.scrollIntoView({block:'nearest',inline:'nearest'}));
  await expect(layer).toHaveAttribute('data-3d-state', 'ready', {timeout:20000});
  await expect(layer).toHaveAttribute('data-asset-state', 'ready');
  if (capture && name) {
    const path = fileURLToPath(new URL(`./atelier-${name}-glb.png`, import.meta.url));
    await page.locator(container).screenshot({path, animations:'disabled'});
  }
  return layer;
}

const button = name => page.getByRole('button',{name});
async function resumeAtFront(outcome, cleared, location = 1) {
  await page.evaluate(({outcome, cleared, location}) => {
    const key = 'mistbound.expedition.v2';
    const save = JSON.parse(localStorage.getItem(key));
    Object.assign(save.campaign, {location, cleared, visited:Array.from({length:location}, (_, i) => i), resumeMap:'local'});
    save.campaign.areas[location - 1] = {route:'woods', stage:3, lastOutcome:outcome};
    localStorage.setItem(key, JSON.stringify(save));
  }, {outcome, cleared, location});
  await page.reload();
  await button('继续远征').click();
}
async function checkMapHud(width, height) {
  await page.setViewportSize({width,height});
  const screen = page.locator('.world-screen');
  await expect(screen).toBeVisible();
  const problems = await screen.evaluate(map => {
    const bounds = map.closest('.game-frame').getBoundingClientRect();
    const dock = map.querySelector('.world-order').getBoundingClientRect();
    const bad = [];
    const canvas = map.querySelector('.world-model-field').getBoundingClientRect();
    if (Math.abs(canvas.width / canvas.height - 1.52) > .01) bad.push('正交地形比例失真');
    for (const element of map.querySelectorAll('button:enabled,summary')) {
      const b = element.getBoundingClientRect();
      const center = document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
      const clipped = b.x < bounds.x-1 || b.y < bounds.y-1 || b.right > bounds.right+1 || b.bottom > bounds.bottom+1;
      if (clipped || !element.contains(center)) bad.push(element.getAttribute('aria-label') || element.textContent);
    }
    for (const label of map.querySelectorAll('.world-node-label,.local-map-point>strong')) {
      const b = label.getBoundingClientRect();
      if (b.bottom > dock.top && b.right > dock.left && b.left < dock.right) bad.push('标记被行动栏遮挡：'+label.textContent);
    }
    if (document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth) bad.push('页面溢出');
    return bad;
  });
  assert.deepEqual(problems,[],width+' × '+height+' 地图各操作应在游戏画面内且可点');
}
try {
  await page.goto(url);
  await scene('.landing-visual', 'landscape');
  await button('开始游戏').click();
  await scene('.story-landscape');
  await button('跳过剧情').click();
  await scene('.world-screen', 'world');
  for (const size of [[1440,960],[390,844],[320,568],[844,390]]) await checkMapHud(...size);
  await page.setViewportSize({width:1440,height:960});
  await page.getByRole('button',{name:'灰苇哨站',exact:true}).click();
  await expect(page.locator('.world-map-footer')).toContainText('队伍驻地 晨星营地');
  await expect(page.locator('.world-order-title')).toContainText('选中目的地');
  await button('行军至灰苇哨站').click();
  await expect(page.getByLabel('队伍行军中')).toBeVisible();
  await button('跳过剧情').click();
  await button('进入战场地图').click();
  await scene('.local-cartography');
  for (const size of [[1440,960],[390,844],[320,568],[844,390]]) await checkMapHud(...size);
  const intel = page.locator('.local-screen .world-intel');
  await intel.locator('summary').click();
  await expect(intel.getByRole('heading',{name:/驻守队伍/})).toBeVisible();
  await intel.locator('summary').press('Escape');
  await expect(intel.locator('.world-intel-sheet')).toBeHidden();
  await button(/穿过林间小径/).click();
  await button('沿选定路线出发').click();
  await expect(button('前往高地观察点')).toBeEnabled();
  await page.setViewportSize({width:390,height:844});
  await scene('.local-screen', 'region-mobile');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  for (const [result, status] of [['enemy', '推演失利'], ['draw', '推演僵持']]) {
    await resumeAtFront(result, []);
    await expect(page.locator('.world-order-title')).toContainText(status);
    await expect(button('再次推演')).toBeEnabled();
    await expect(page.locator('.world-map-footer')).toContainText('林间小径');
  }
  await resumeAtFront('ally', [0]);
  await expect(page.locator('.world-order-title')).toContainText('据点已解放');
  await expect(button('重新推演')).toBeEnabled();
  for (const size of [[320,568],[844,390]]) await checkMapHud(...size);
  await page.getByRole('button', {name:'返回大地图', exact:true}).click();
  await expect(page.locator('.world-node[aria-current="location"]')).toContainText('灰苇哨站');
  await expect(page.locator('.world-node[aria-pressed="true"]')).toContainText('暮钟隘口');
  await expect(button('行军至暮钟隘口')).toBeEnabled();
  await resumeAtFront('ally', [0,1,2], 3);
  await page.getByRole('button', {name:'返回大地图', exact:true}).click();
  await expect(page.locator('.world-map-footer')).toContainText('全境已解放');
  await expect(button('回访战场地图')).toBeEnabled();

  await page.setViewportSize({width:1440,height:960});
  await page.goto(url);
  await button('进入《山河初燃》').click();
  await scene('.sh-map-canvas');
  await button('进入战场地图').click();
  const dialogue = await scene('.sh-dialogue-overlay', 'dialogue');
  await expect(dialogue).toHaveAttribute('data-weather','rain');
  while (await button('略过本段').count()) await button('略过本段').click();
  const map = await scene('.sh-map-canvas');
  const nodes = page.locator('[data-node-id]');
  await nodes.nth(1).click();
  await expect(nodes.nth(1)).toHaveAttribute('aria-pressed','true');
  await map.locator('canvas').evaluate(canvas => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await expect(map).toHaveAttribute('data-3d-state','fallback');
  await nodes.first().click();
  await expect(nodes.first()).toHaveAttribute('aria-pressed','true');
  assert.deepEqual(errors,[]);
  console.log('Map and cinematic surfaces passed: travel, defeat, draw, victory return, full clearance, mobile layout, GLB assets and context-loss fallback.');
} finally {
  await browser.close();
}
