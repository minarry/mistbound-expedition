import { describe, expect, it } from 'vitest';
import { simulate, starter, encounters, unit, JOBS, createDefaultContent, validateContent } from './battle';
describe('deterministic battle engine',()=>{
 it('replays identically without mutating inputs',()=>{const team=starter();const copy=structuredClone(team);expect(simulate(team,encounters[0].units)).toEqual(simulate(team,encounters[0].units));expect(team).toEqual(copy);});
 it('keeps snapshots independent and resources bounded',()=>{const b=simulate(starter(),encounters[1].units);for(const f of b.frames)for(const u of f.units){expect(u.hp).toBeGreaterThanOrEqual(0);expect(u.hp).toBeLessThanOrEqual(u.maxHp);expect(u.ap).toBeGreaterThanOrEqual(0);expect(u.pp).toBeGreaterThanOrEqual(0);}expect(b.frames[0].units.every(u=>u.hp===JOBS[u.job].hp)).toBe(true);expect(b.rounds).toBeLessThanOrEqual(8);});
 it('allows the default squad to win the first encounter',()=>{expect(simulate(starter(),encounters[0].units).winner).toBe('ally');});
 it('supports an alternate winning configuration',()=>{const team=starter();team[0].rules.reverse();team[2].slot=4;expect(simulate(team,encounters[0].units).winner).toBe('ally');});
 it('makes disabled tactics lose instead of silently attacking',()=>{const team=starter().map(u=>({...u,rules:u.rules.map(r=>({...r,enabled:false}))}));expect(simulate(team,encounters[0].units).winner).toBe('enemy');});
 it('respects priority and remaining AP',()=>{const b=simulate([unit('a','剑','sword',0)],[unit('e','盾','guard',0)]);const actions=b.frames.filter(f=>f.kind==='attack'&&f.actor==='a'&&f.round===1);expect(actions[0].text).toContain('破阵斩');expect(actions[1].text).toContain('普通攻击');expect(actions).toHaveLength(2);});
 it('blocks melee access to rear while allowing ranged targeting',()=>{const enemy=[unit('e1','前盾','guard',0),unit('e2','后牧','priest',4)];const b=simulate([unit('a','弓','bow',0)],enemy);expect(b.frames.find(f=>f.kind==='attack'&&f.actor==='a')?.target).toBe('e2');const s=unit('s','剑','sword',0);s.rules.forEach(r=>r.target='back');expect(simulate([s],enemy).frames.find(f=>f.kind==='attack'&&f.actor==='s')?.target).toBe('e1');});
 it('only guards the same rear column',()=>{const a=unit('a','弓','bow',0);const guard=unit('g','盾','guard',0),priest=unit('p','牧','priest',3);expect(simulate([a],[guard,priest]).frames.some(f=>f.text.includes('举盾'))).toBe(true);priest.slot=4;expect(simulate([a],[guard,priest]).frames.some(f=>f.text.includes('举盾'))).toBe(false);});
 it('filters heal targets by condition and never heals a full target',()=>{const b=simulate(starter(),encounters[0].units);const heals=b.frames.filter(f=>f.kind==='heal');expect(heals.length).toBeGreaterThan(0);for(const f of heals){const prev=b.frames[b.frames.indexOf(f)-1];const target=prev.units.find(u=>u.id===f.target)!;expect(target.hp/target.maxHp).toBeLessThan(.7);}});
 it('handles no eligible rules as a bounded draw',()=>{const a=unit('a','甲','guard',0),b=unit('b','乙','guard',0);a.rules=[];b.rules=[];const result=simulate([a],[b]);expect(result.winner).toBe('draw');expect(result.rounds).toBe(8);});
 it('rejects overlapping and invalid formations',()=>{expect(()=>simulate([unit('a','甲','guard',0),unit('b','乙','bow',0)],encounters[0].units)).toThrow();expect(()=>simulate([],encounters[0].units)).toThrow();});
});

describe('structured presentation cues', () => {
 it('describes every action with the exact HP delta, without cues on round or result frames', () => {
   const effects = new Set<string>();
   for (const encounter of encounters) {
     const battle = simulate(starter(), encounter.units);
     battle.frames.forEach((frame, index) => {
       if (frame.kind === 'start' || frame.kind === 'end') {
         expect(frame.action).toBeUndefined();
         return;
       }
       const cue = frame.action!;
       expect(cue).toBeDefined();
       effects.add(cue.effect);
       const before = battle.frames[index - 1];
       const actor = frame.units.find(fighter => fighter.id === frame.actor)!;
       const target = frame.units.find(fighter => fighter.id === frame.target)!;
       const previousTarget = before.units.find(fighter => fighter.id === frame.target)!;
       expect(actor).toBeDefined();
       expect(target).toBeDefined();
       const direction = cue.effect === 'heal' || cue.effect === 'blessing' ? 1 : -1;
       expect(target.hp - previousTarget.hp).toBe(cue.amount === 0 ? 0 : direction * cue.amount);
       for (const other of frame.units.filter(fighter => fighter.id !== frame.target)) {
         expect(other.hp).toBe(before.units.find(fighter => fighter.id === other.id)!.hp);
       }
       expect(cue.resource).toBe(frame.kind === 'passive' ? 'PP' : 'AP');
       if (cue.resource === 'PP') {
         expect(cue.cost).toBe(1);
         expect(before.units.find(fighter => fighter.id === frame.actor)!.pp - actor.pp).toBe(1);
       }
     });
   }
   expect([...effects].sort()).toEqual(['strike', 'heavy', 'pierce', 'heal', 'cover', 'counter', 'followup', 'blessing'].sort());
 });

 it('keeps the protected unit and incoming attacker on cover, then redirects the attack to the guard', () => {
   const result = simulate([unit('archer', '弓手', 'bow', 0)], [unit('guard', '盾卫', 'guard', 0), unit('priest', '牧师', 'priest', 3)]);
   const coverIndex = result.frames.findIndex(frame => frame.action?.effect === 'cover');
   expect(coverIndex).toBeGreaterThan(0);
   const cover = result.frames[coverIndex];
   expect(cover.actor).toBe('guard');
   expect(cover.target).toBe('priest');
   expect(cover.action).toEqual({ effect: 'cover', label: '举盾掩护', amount: 0, resource: 'PP', cost: 1, incomingActor: 'archer' });
   const attack = result.frames[coverIndex + 1];
   expect(attack.actor).toBe('archer');
   expect(attack.target).toBe('guard');
   expect(attack.action).toMatchObject({ effect: 'pierce', redirectedFrom: 'priest', resource: 'AP', cost: 2 });
   expect(result.frames.find(frame => frame.action?.effect === 'followup')?.action?.redirectedFrom).toBeUndefined();
 });

 it('uses editable skill labels and AP costs while preserving stable effect identifiers', () => {
   const content = createDefaultContent();
   content.skills.strike.name = '自定基础技';
   content.skills.heavy.name = '自定剑技';
   content.skills.pierce.name = '自定箭技';
   content.skills.heal.name = '自定治疗';
   content.skills.heavy.cost = 3;
   const seen = new Set<string>();
   for (const encounter of content.encounters) {
     for (const frame of simulate(content.squad, encounter.units, content).frames) {
       const cue = frame.action;
       if (!cue || cue.resource !== 'AP') continue;
       if (cue.effect === 'strike' || cue.effect === 'heavy' || cue.effect === 'pierce' || cue.effect === 'heal') {
         seen.add(cue.effect);
         expect(cue.label).toBe(content.skills[cue.effect].name);
         expect(cue.cost).toBe(content.skills[cue.effect].cost);
       }
     }
   }
   expect([...seen].sort()).toEqual(['strike', 'heavy', 'pierce', 'heal'].sort());
 });

 it('reports actual amounts when damage or healing is capped by remaining HP', () => {
   const content = createDefaultContent();
   content.jobs.guard.hp = 5;
   const attack = simulate([unit('a', '弓手', 'bow', 0)], [unit('e', '盾卫', 'guard', 0)], content).frames.find(frame => frame.action?.effect === 'pierce');
   expect(attack?.action?.amount).toBe(5);
   content.jobs.bow.hp = 3;
   const counter = simulate([unit('a', '弓手', 'bow', 0)], [unit('e', '剑士', 'sword', 0)], content).frames.find(frame => frame.action?.effect === 'counter');
   expect(counter?.action).toMatchObject({ label: '反击', amount: 3 });
   content.jobs.guard.hp = 50;
   const followup = simulate([unit('a', '弓手', 'bow', 0)], [unit('e', '盾卫', 'guard', 0)], content).frames.find(frame => frame.action?.effect === 'followup');
   expect(followup?.action).toMatchObject({ label: '追击', amount: 4 });
   const healingContent = createDefaultContent();
   healingContent.skills.heal.healing = 300;
   const healing = simulate(starter(), encounters[0].units, healingContent).frames.find(frame => frame.action?.effect === 'heal');
   expect(healing?.action?.amount).toBeGreaterThan(0);
   expect(healing?.action?.amount).toBeLessThan(300);
   const healedTarget = healing?.units.find(fighter => fighter.id === healing.target);
   expect(healedTarget?.hp).toBe(healedTarget?.maxHp);
 });

 // Gameplay abstractions: fingerprints captured before adding presentation cues.
 // They lock every existing log, actor, target, HP/AP/PP snapshot and event order.
 it.each([
   [0, 'ally', 3, 50, 'b4705b90'],
   [1, 'draw', 8, 234, '8fa5ca76'],
   [2, 'enemy', 3, 97, '4ffebd'],
 ] as const)('preserves the complete pre-cue simulation for encounter %i', (index, winner, rounds, frameCount, expectedFingerprint) => {
   const result = simulate(starter(), encounters[index].units);
   const legacy = { frames: result.frames.map(({ round, text, kind, actor, target, units }) => ({ round, text, kind, actor, target, units })), winner: result.winner, rounds: result.rounds };
   let hash = 0x811c9dc5;
   for (const character of JSON.stringify(legacy)) {
     hash ^= character.charCodeAt(0);
     hash = Math.imul(hash, 0x01000193);
   }
   expect((hash >>> 0).toString(16)).toBe(expectedFingerprint);
   expect(result.winner).toBe(winner);
   expect(result.rounds).toBe(rounds);
   expect(result.frames).toHaveLength(frameCount);
 });
});

describe('editable content', () => {
 it('validates defaults and returns isolated data', () => {
   const source = createDefaultContent();
   const content = validateContent(source);
   expect(content).toEqual(source);
   content.jobs.sword.hp = 200;
   content.squad[0].name = '新队长';
   expect(source.jobs.sword.hp).toBe(JOBS.sword.hp);
   expect(createDefaultContent().squad[0].name).toBe('莱恩');
 });
 it('uses edited health, damage, action cost and skill names', () => {
   const content = createDefaultContent();
   const ally = unit('a', '剑士', 'sword', 0);
   const enemy = unit('e', '盾卫', 'guard', 0);
   const baseline = simulate([ally], [enemy]);
   content.jobs.sword.hp = 150;
   content.jobs.sword.atk = 40;
   content.skills.heavy = { name: '破晓斩', cost: 3, power: 2.5, healing: 0 };
   const edited = simulate([ally], [enemy], content);
   const actions = edited.frames.filter(frame => frame.kind === 'attack' && frame.actor === 'a' && frame.round === 1);
   expect(edited.frames[0].units.find(fighter => fighter.id === 'a')?.maxHp).toBe(150);
   expect(actions).toHaveLength(1);
   expect(actions[0].text).toContain('破晓斩 −87 HP');
   expect(edited).not.toEqual(baseline);
   expect(content.jobs.sword.hp).toBe(150);
 });
 it('uses edited speed for turn order and defense for damage', () => {
   const content = createDefaultContent();
   content.jobs.guard.speed = 100;
   content.jobs.guard.def = 40;
   const result = simulate([unit('a', '剑士', 'sword', 0)], [unit('e', '盾卫', 'guard', 0)], content);
   expect(result.frames.find(frame => frame.kind === 'attack')?.actor).toBe('e');
   expect(result.frames.find(frame => frame.kind === 'attack' && frame.actor === 'a')?.text).toContain('−11 HP');
 });
 it('uses edited healing amounts and names', () => {
   const content = createDefaultContent();
   content.skills.heal.healing = 7;
   content.skills.heal.name = '微光';
   const result = simulate(content.squad, content.encounters[0].units, content);
   const heals = result.frames.filter(frame => frame.kind === 'heal');
   expect(heals.length).toBeGreaterThan(0);
   expect(heals.every(frame => frame.text.includes('微光 +7 HP'))).toBe(true);
 });
 it.each([
   ['non-finite stats', (content: ReturnType<typeof createDefaultContent>) => { content.jobs.sword.hp = NaN; }],
   ['out-of-range stats', (content: ReturnType<typeof createDefaultContent>) => { content.jobs.guard.def = -1; }],
   ['fractional action cost', (content: ReturnType<typeof createDefaultContent>) => { content.skills.strike.cost = 1.5; }],
   ['zero action cost', (content: ReturnType<typeof createDefaultContent>) => { content.skills.heavy.cost = 0; }],
   ['oversized power', (content: ReturnType<typeof createDefaultContent>) => { content.skills.pierce.power = 6; }],
   ['negative healing', (content: ReturnType<typeof createDefaultContent>) => { content.skills.heal.healing = -10; }],
   ['empty role name', (content: ReturnType<typeof createDefaultContent>) => { content.squad[0].name = '  '; }],
   ['duplicate slots', (content: ReturnType<typeof createDefaultContent>) => { content.squad[0].slot = content.squad[1].slot; }],
   ['duplicate IDs', (content: ReturnType<typeof createDefaultContent>) => { content.squad[0].id = content.squad[1].id; }],
   ['cross-team IDs', (content: ReturnType<typeof createDefaultContent>) => { content.encounters[0].units[0].id = content.squad[0].id; }],
   ['wrong skill for job', (content: ReturnType<typeof createDefaultContent>) => { content.squad[0].rules[0].skill = 'heal'; }],
   ['empty team', (content: ReturnType<typeof createDefaultContent>) => { content.squad = []; }],
   ['missing encounter', (content: ReturnType<typeof createDefaultContent>) => { content.encounters.pop(); }],
 ])('rejects %s', (_name, modify) => {
   const content = createDefaultContent(); modify(content);
   expect(() => validateContent(content)).toThrow(Error);
 });
 it('rejects malformed imported enums and booleans with useful errors', () => {
   const content = createDefaultContent();
   expect(() => validateContent(null)).toThrow('游戏内容');
   expect(() => validateContent({ ...content, squad: [{ ...content.squad[0], job: 'mage' }] })).toThrow('职业');
   expect(() => validateContent({ ...content, squad: [{ ...content.squad[0], rules: [{ ...content.squad[0].rules[0], enabled: 'true' }] }] })).toThrow('启用状态');
   expect(() => validateContent({ ...content, squad: [{ ...content.squad[0], rules: [{ ...content.squad[0].rules[0], target: 'random' }] }] })).toThrow('目标');
 });
});
