import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const meta = read('../data/scenarios/shanhe-book.json');
const book = { ...meta, levels: [...read('../data/scenarios/shanhe-early.json').levels, ...read('../data/scenarios/shanhe-late.json').levels] };
const key = 'mistbound.shanhe.v1';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const url = process.env.GAME_URL || 'http://127.0.0.1:5173';
const dialogue = () => page.getByRole('dialog', { name: '剧情对话', exact: true });
const state = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
async function dismiss() {
  for (let i = 0; i < 5 && await dialogue().count(); i++) await dialogue().getByRole('button', { name: '略过本段' }).click();
  await expect(dialogue()).toHaveCount(0);
}
async function capture(name) {
  const fullPage = !(await dialogue().count());
  async function checkFrame() {
    const problems = await page.evaluate(() => {
      const frame = document.querySelector('.game-frame').getBoundingClientRect();
      const controls = document.querySelectorAll('.sh-field:not([inert]) .sh-field-header button, .sh-field:not([inert]) .sh-map-node, .sh-field:not([inert]) .sh-command-actions button, .sh-dialogue-controls button, .sh-dialogue-nav button, .sh-window-bar button, .tactical-report button');
      return [...controls].flatMap(control => {
        const {left,top,right,bottom,width,height} = control.getBoundingClientRect();
        const hit = document.elementFromPoint(left+width/2,top+height/2);
        return left < frame.left-1 || right > frame.right+1 || top < frame.top-1 || bottom > frame.bottom+1 || !control.contains(hit)
          ? [control.textContent.trim()] : [];
      });
    });
    assert.deepEqual(problems,[],name+' HUD controls must remain inside the game and reachable');
  }
  await checkFrame();
  await page.screenshot({ path: `e2e/story-${name}-desktop.png`, fullPage, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await checkFrame();
  await page.screenshot({ path: `e2e/story-${name}-mobile.png`, fullPage, animations: 'disabled' });
  if (!fullPage) {
    const controls = await page.locator('.sh-dialogue-controls').boundingBox();
    assert.ok(controls && controls.y >= 0 && controls.y + controls.height <= 844, 'mobile dialogue controls remain visible');
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth &&
    document.documentElement.scrollHeight <= innerHeight), `${name}: no page overflow on mobile`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  console.log('Captured narrative', name);
}
function path(level, start, end) {
  const queue = [[start]], seen = new Set([start]);
  while (queue.length) {
    const route = queue.shift(), current = route.at(-1);
    if (current === end) return route.slice(1);
    for (const edge of level.edges) {
      const next = edge.from === current ? edge.to : edge.to === current ? edge.from : null;
      if (next && !seen.has(next) && (next !== level.exit || end === level.exit)) { seen.add(next); queue.push([...route, next]); }
    }
  }
  throw new Error(`Unreachable ${level.id}/${end}`);
}
let checkedBattle = false, checkedChoice = false;
async function finishCurrent(level) {
  await dismiss();
  const before = await state(), progress = before.progress[level.id];
  if (progress.resolved.includes(progress.current)) return;
  const node = level.nodes.find(n => n.id === progress.current);
  // Gameplay fixture: removing all tactics produces a deterministic loss at this node.
  if (node.kind === 'battle' && !checkedBattle) {
    checkedBattle = true;
    await page.getByRole('button', { name: '小队编成与战术' }).click();
    await page.getByRole('button', {name:'编辑战术'}).click();
    for (const name of ['罗石', '沈砚', '阿禾', '田穗']) {
      await page.locator(`.roster button[title="${name}"]`).click();
      for (const checkbox of await page.locator('.rule input[type="checkbox"]').all()) await checkbox.uncheck();
    }
    await page.getByRole('button', {name:'关闭面板'}).click();
    await page.getByRole('button', { name: '完成编队 →', exact: true }).click();
    await page.getByRole('button', { name: '进入战斗推演' }).click();
    await expect(page.getByTestId('battle-stage')).toBeVisible();
    await page.getByRole('button', { name: '返回战场地图', exact: true }).click();
    await page.getByRole('button', { name: '撤回战场地图', exact: true }).click();
    await expect(page.getByTestId('story-level')).toBeVisible();
    await expect(dialogue()).toHaveCount(0);
    assert.equal((await state()).progress[level.id].lastBattle, undefined);
    assert.ok(!(await state()).progress[level.id].resolved.includes(node.id));
    await page.getByRole('button', { name: '进入战斗推演' }).click();
    const report = page.getByTestId('battle-result');
    await page.getByRole('button', { name: '查看战果', exact: true }).click();
    await expect(report.getByRole('heading')).toHaveText('战斗失利');
    await expect(report.locator('.report-routes .hud-primary')).toHaveText('返回战场地图');
    await expect(report.locator('.report-routes .hud-primary')).toBeFocused();
    await capture('tactical');
    await report.getByRole('button', { name: '返回章节大地图', exact: true }).click();
    await expect(page.getByTestId('story-atlas')).toBeVisible();
    await expect(page.getByRole('region', { name:'选中关卡' })).toContainText(node.name);
    await page.reload();
    await page.getByRole('button', { name: '进入《山河初燃》' }).click();
    await expect(page.getByTestId('story-atlas')).toBeVisible();
    assert.deepEqual((await state()).progress[level.id].lastBattle, { winner:'enemy', needsDebrief:true });
    await page.getByRole('button', { name: '继续本关战场' }).click();
    await expect(dialogue()).toBeVisible();
    assert.equal((await state()).pending.kind, 'failure');
    const failureLine = await page.locator('.sh-dialogue-copy>p').innerText();
    await dialogue().getByRole('button', { name:'返回章节大地图' }).click();
    await expect(page.getByTestId('story-atlas')).toBeVisible();
    assert.equal((await state()).progress[level.id].pausedDialogue.kind,'failure');
    await page.getByRole('button', { name:'继续本关战场' }).click();
    await expect(page.locator('.sh-dialogue-copy>p')).toHaveText(failureLine);
    await dismiss();
    assert.ok(!(await state()).progress[level.id].resolved.includes(node.id), 'defeat never completes the narrative target');
    await page.getByRole('button', { name: '再次战斗推演' }).click();
    await page.getByRole('button', { name: '查看战果', exact: true }).click();
    await report.getByRole('button', { name: '调整编队再战' }).click();
    await page.getByRole('button', { name: '开始交战' }).click();
    await page.getByRole('button', { name: '返回战场地图', exact: true }).click();
    await page.getByRole('button', { name: '撤回战场地图', exact: true }).click();
    await expect(page.getByTestId('story-level')).toHaveAttribute('data-current-node', node.id);
    await expect(dialogue()).toBeVisible();
    assert.equal((await state()).pending.kind, 'failure', 'the last settled loss still has its unread debrief');
    await dismiss();
    assert.deepEqual((await state()).progress[level.id].lastBattle, {winner:'enemy',needsDebrief:false});
    await page.getByRole('button', { name: '小队编成与战术' }).click();
    await page.getByRole('button', {name:'编辑战术'}).click();
    await page.getByRole('button', { name: '重置编队', exact: true }).click();
    await page.getByRole('button', {name:'关闭面板'}).click();
    await page.getByRole('button', { name: '完成编队 →', exact: true }).click();
    await page.getByRole('button', { name: '再次战斗推演' }).click();
    await page.getByRole('button', { name: '查看战果', exact: true }).click();
    await expect(report.getByRole('heading')).toHaveText('战斗胜利');
    await expect(report.locator('.report-routes .hud-primary')).toHaveText('返回战场地图');
    await expect(report.locator('.report-routes .hud-primary')).toBeFocused();
    await report.getByRole('button', { name: '返回战场地图', exact: true }).click();
    await expect(page.getByTestId('story-level')).toHaveAttribute('data-current-node', node.id);
    await expect(page.getByRole('region', { name:'节点行动' })).toContainText('上次推演胜利');
    assert.ok(!(await state()).progress[level.id].resolved.includes(node.id), 'winning still leaves the story objective to the player');
    await page.getByRole('button', { name: '再次战斗推演' }).click();
    await page.getByRole('button', { name: '返回战场地图', exact: true }).click();
    await page.getByRole('button', { name: '撤回战场地图', exact: true }).click();
    await expect(page.getByRole('region', { name:'节点行动' })).toContainText('上次推演胜利');
    await expect(dialogue()).toHaveCount(0);
  }
  if (node.kind === 'choice') {
    if (!checkedChoice) await capture('choice');
    await page.locator(`[data-choice-id="${node.choices[1].id}"]`).click();
    if (!checkedChoice) {
      checkedChoice = true;
      await expect(dialogue()).toBeVisible();
      assert.equal((await state()).progress[level.id].choices[node.id], node.choices[1].id);
      const text = await page.locator('.sh-dialogue-copy>p').innerText();
      await page.reload();
      await page.getByRole('button', { name: '进入《山河初燃》' }).click();
      await expect(page.locator('.sh-dialogue-copy>p')).toHaveText(text);
    }
  } else await page.getByRole('button', { name: node.kind === 'exit' ? '结束本关 · 阅读后续' : node.kind === 'battle' ? '执行剧情目标' : '完成节点行动' }).click();
  await dismiss();
  assert.ok((await state()).progress[level.id].resolved.includes(node.id));
}
async function travel(level, target) {
  const s = await state();
  for (const nodeId of path(level, s.progress[level.id].current, target)) {
    await finishCurrent(level);
    await page.locator(`[data-node-id="${nodeId}"]`).click();
    await expect(page.getByRole('button', { name: '前往选中节点' })).toBeEnabled();
    await page.getByRole('button', { name: '前往选中节点' }).click();
    await dismiss();
    assert.equal((await state()).progress[level.id].current, nodeId);
  }
}

try {
  await page.goto(url);
  await expect(page.getByRole('button', { name: '进入《山河初燃》' })).toBeVisible();
  // Existing player progress is a gameplay abstraction in this isolated context.
  await page.evaluate(() => {
    const old = JSON.parse(localStorage.getItem('mistbound.expedition.v2'));
    old.campaign.started = true; old.campaign.location = 1; old.campaign.visited = [0];
    old.campaign.areas[0].stage = 2; old.campaign.team[0].name = '原远征队员';
    old.content.skills.heavy.name = '自定义旧技能';
    localStorage.setItem('mistbound.expedition.v2', JSON.stringify(old));
  });
  await page.reload();
  await expect(page.getByRole('button', { name: '进入《山河初燃》' })).toBeVisible();
  const legacy = await page.evaluate(() => JSON.parse(localStorage.getItem('mistbound.expedition.v2')));
  await page.getByRole('button', { name: '进入《山河初燃》' }).click();
  await expect(page.getByTestId('story-atlas')).toBeVisible();
  await capture('atlas');
  await page.getByRole('button',{name:'行程详情'}).click();
  await expect(page.getByRole('dialog',{name:'行程详情'})).toContainText(book.levels[0].objective);
  await page.keyboard.press('Escape');
  await page.locator('[data-level-id="s02"]').click();
  await expect(page.getByRole('button', { name: '完成前关后启程' })).toBeDisabled();
  await page.locator('[data-level-id="s01"]').click();
  await page.getByRole('button', { name: '进入战场地图' }).click();
  await expect(dialogue()).toBeVisible();
  await dialogue().getByRole('button', { name: '继续对白' }).click();
  const introLine = await page.locator('.sh-dialogue-copy>p').innerText();
  await capture('dialogue');
  await page.reload();
  await page.getByRole('button', { name: '进入《山河初燃》' }).click();
  await expect(page.locator('.sh-dialogue-copy>p')).toHaveText(introLine);
  await dismiss();
  await page.locator(`[data-node-id="${book.levels[0].exit}"]`).click();
  await expect(page.getByRole('button', { name: '前往选中节点' })).toBeDisabled();
  await page.getByRole('button', { name: '小队编成与战术' }).click();
  await page.getByRole('button', { name: '完成编队 →', exact: true }).click();
  await expect(page.locator(`[data-node-id="${book.levels[0].exit}"]`)).toHaveAttribute('aria-pressed','true');
  await page.locator(`[data-node-id="${book.levels[0].entry}"]`).click();
  await capture('local');

  for (const level of book.levels) {
    await expect(page.getByTestId('story-level')).toHaveAttribute('data-level-id', level.id);
    for (const node of level.nodes.filter(n => n.id !== level.exit)) { await travel(level, node.id); await finishCurrent(level); }
    await travel(level, level.exit);
    await finishCurrent(level);
    await expect(page.getByTestId('level-complete')).toBeVisible();
    const done = await state();
    assert.equal(done.progress[level.id].completed, true);
    assert.equal(done.progress[level.id].resolved.length, level.nodes.length);
    console.log('Completed narrative', level.id, level.title);
    if (level.id !== book.levels.at(-1).id) {
      await page.getByRole('button', { name: '前往下一关' }).click();
      await dismiss();
    }
  }
  await page.getByRole('button', { name: '返回全篇行记' }).click();
  await expect(page.getByTestId('story-finale')).toBeVisible();
  await capture('finale');
  await page.getByRole('button', { name: '行军菜单' }).click();
  await page.getByRole('button', { name: '行军手记', exact: true }).click();
  await expect(page.getByTestId('story-journal')).toContainText('手记中的决定');
  await page.getByRole('button', { name: '剧本与史料', exact: true }).click();
  await page.getByLabel('选择关卡剧本').selectOption('s20');
  await expect(page.locator('.sh-script-level')).toContainText('1930');
  await capture('script');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出完整剧本' }).click();
  const download = await downloadPromise;
  assert.ok(download.suggestedFilename().endsWith('.md'));
  const file = await download.path();
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes(book.levels[0].title) && text.includes(book.levels.at(-1).title));
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('mistbound.expedition.v2'))), legacy, 'original expedition save remains intact');
  await page.getByRole('button', { name: '返回章节大地图', exact: true }).click();
  await expect(page.getByRole('region', { name: '再问前路章节地图' })).toBeVisible();
  await expect(page.locator('[data-level-id="s20"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '行军菜单' }).click();
  await page.getByRole('button', { name: '重新开始本篇' }).click();
  await page.getByRole('button', { name: '保留行记', exact: true }).click();
  assert.equal(Object.values((await state()).progress).filter(p => p.completed).length, 20);
  await page.reload();
  await page.getByRole('button', { name: '进入《山河初燃》' }).click();
  await expect(page.getByTestId('story-finale')).toBeVisible();
  assert.deepEqual(errors, []);
  console.log('PASS: twenty levels / all nodes / choices / tactical withdrawal, defeat and victory / both result exits / exact-line resume / legacy save isolation / script export / mobile / no browser errors');
} finally { await browser.close(); }
