/** Pure deterministic simulation. No React, clocks, global state or random sources. */
export type Job = 'sword' | 'guard' | 'bow' | 'priest';
export type Condition = 'always' | 'hurt' | 'critical' | 'round2';
export type Target = 'lowest' | 'highest' | 'back' | 'front';
export type Skill = 'strike' | 'heavy' | 'pierce' | 'heal';
export interface Rule { skill: Skill; condition: Condition; target: Target; enabled: boolean }
export interface Unit { id: string; name: string; job: Job; slot: number; rules: Rule[] }
export interface Fighter extends Unit { side: 'ally' | 'enemy'; hp: number; maxHp: number; ap: number; pp: number }
export type BattleEffect = 'strike' | 'heavy' | 'pierce' | 'heal' | 'cover' | 'counter' | 'followup' | 'blessing';
export interface ActionCue { effect: BattleEffect; label: string; amount: number; resource: 'AP' | 'PP'; cost: number; redirectedFrom?: string; incomingActor?: string }
export interface Frame { round: number; text: string; kind: 'start' | 'attack' | 'heal' | 'passive' | 'end'; actor?: string; target?: string; units: Fighter[]; action?: ActionCue }
export interface Battle { frames: Frame[]; winner: 'ally' | 'enemy' | 'draw'; rounds: number }
export interface JobDefinition { name: string; icon: string; hp: number; atk: number; def: number; speed: number; passive: string }
export interface SkillDefinition { name: string; cost: number; power: number; healing: number }
export interface Encounter { name: string; subtitle: string; detail: string; units: Unit[] }
export interface GameContent { jobs: Record<Job, JobDefinition>; skills: Record<Skill, SkillDefinition>; encounters: Encounter[]; squad: Unit[] }
export const JOBS: Record<Job, JobDefinition> = {
  sword: { name: '剑士', icon: '⚔', hp: 94, atk: 27, def: 6, speed: 16, passive: '反击：受击后消耗 1 PP，造成 14 伤害' },
  guard: { name: '盾卫', icon: '⬡', hp: 138, atk: 17, def: 13, speed: 7, passive: '掩护：为同列后排分担攻击，消耗 1 PP，减伤 45%' },
  bow: { name: '弓手', icon: '➶', hp: 72, atk: 28, def: 3, speed: 20, passive: '追击：攻击后消耗 1 PP，造成 8 伤害' },
  priest: { name: '牧师', icon: '✦', hp: 80, atk: 15, def: 4, speed: 12, passive: '祈护：友军低于 35% HP 时消耗 1 PP，恢复 16 HP' },
};
export const SKILLS: Record<Skill, SkillDefinition> = { strike: { name: '普通攻击', cost: 1, power: 1, healing: 0 }, heavy: { name: '破阵斩', cost: 2, power: 1.9, healing: 0 }, pierce: { name: '穿透箭', cost: 2, power: 1.65, healing: 0 }, heal: { name: '愈合术', cost: 1, power: 0, healing: 34 } };
export const CONDITIONS: Record<Condition, string> = { always: '始终', hurt: '目标 HP < 70%', critical: '目标 HP < 35%', round2: '第 2 轮起' };
export const TARGETS: Record<Target, string> = { lowest: '最低生命比例', highest: '最高生命比例', back: '优先后排', front: '优先前排' };
export function skillsFor(job: Job): Skill[] { return job === 'sword' ? ['heavy', 'strike'] : job === 'bow' ? ['pierce', 'strike'] : job === 'priest' ? ['heal', 'strike'] : ['strike']; }
export function defaultRules(job: Job): Rule[] { return skillsFor(job).map(skill => ({ skill, condition: skill === 'heal' ? 'hurt' : 'always', target: skill === 'pierce' ? 'back' : 'lowest', enabled: true })); }
export function unit(id: string, name: string, job: Job, slot: number): Unit { return { id, name, job, slot, rules: defaultRules(job) }; }
export function starter(): Unit[] { return [unit('a1','莱恩','sword',1),unit('a2','布兰','guard',0),unit('a3','希芙','bow',5),unit('a4','艾拉','priest',3)]; }
export const encounters: Encounter[] = [
  { name: '灰苇哨站', subtitle: '边境遭遇', detail: '散兵占据了旧哨站。稳住前排，让弓手寻找后排突破口。', units: [unit('e1','苇地守卫','guard',0),unit('e2','游荡剑客','sword',1),unit('e3','灰羽斥候','bow',3)] },
  { name: '暮钟隘口', subtitle: '精锐防线', detail: '敌方牧师持续治疗。穿透箭优先后排，或集中攻击迅速打开缺口。', units: [unit('e1','暮钟铁卫','guard',0),unit('e2','隘口剑士','sword',1),unit('e3','巡林射手','bow',4),unit('e4','司灯者','priest',3)] },
  { name: '荆冠废庭', subtitle: '终局试炼', detail: '两名射手会越过前排。把脆弱队员放到盾卫同列后方，争取反击机会。', units: [unit('e1','荆冠卫士','guard',0),unit('e2','废庭剑客','sword',2),unit('e3','黑羽','bow',3),unit('e4','乌翎','bow',5),unit('e5','余烬祭司','priest',4)] },
];
/** Return an isolated authoring document: editing it never changes the bundled defaults. */
export function createDefaultContent(): GameContent { return structuredClone({ jobs: JOBS, skills: SKILLS, encounters, squad: starter() }); }

const JOB_KEYS: Job[] = ['sword', 'guard', 'bow', 'priest'];
const SKILL_KEYS: Skill[] = ['strike', 'heavy', 'pierce', 'heal'];
const CONDITION_KEYS: Condition[] = ['always', 'hurt', 'critical', 'round2'];
const TARGET_KEYS: Target[] = ['lowest', 'highest', 'back', 'front'];

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label}必须是有效对象。`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, maxLength: number, multiline = false): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value)) throw new Error(`${label}必须包含 1–${maxLength} 个可见字符。`);
  return value.trim();
}
function number(value: unknown, label: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`${label}必须是 ${min}–${max} 范围内的${integer ? '整数' : '数值'}。`);
  return value;
}
function member<T extends string>(value: unknown, options: T[], label: string): T {
  if (typeof value !== 'string' || !options.includes(value as T)) throw new Error(`${label}无效，可选值为：${options.join('、')}。`);
  return value as T;
}
function validateTeam(input: unknown, label: string): Unit[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 6) throw new Error(`${label}必须包含 1–6 名角色。`);
  const ids = new Set<string>();
  const slots = new Set<number>();
  return input.map((value, index) => {
    const prefix = `${label}第 ${index + 1} 名角色`;
    const raw = object(value, prefix);
    const id = text(raw.id, `${prefix} ID`, 64);
    const name = text(raw.name, `${prefix}姓名`, 24);
    const job = member(raw.job, JOB_KEYS, `${prefix}职业`);
    const slot = number(raw.slot, `${prefix}阵位`, 0, 5, true);
    if (ids.has(id)) throw new Error(`${label}角色 ID 必须唯一：${id}。`);
    if (slots.has(slot)) throw new Error(`${label}阵位必须唯一：位置 ${slot} 已被占用。`);
    ids.add(id); slots.add(slot);
    if (!Array.isArray(raw.rules) || raw.rules.length > 12) throw new Error(`${prefix}战术必须是最多 12 条规则的列表。`);
    const rules = raw.rules.map((value, ruleIndex) => {
      const ruleLabel = `${prefix}第 ${ruleIndex + 1} 条战术`;
      const rawRule = object(value, ruleLabel);
      const skill = member(rawRule.skill, SKILL_KEYS, `${ruleLabel}技能`);
      if (!skillsFor(job).includes(skill)) throw new Error(`${ruleLabel}的技能不属于该职业。`);
      const condition = member(rawRule.condition, CONDITION_KEYS, `${ruleLabel}条件`);
      const target = member(rawRule.target, TARGET_KEYS, `${ruleLabel}目标`);
      if (typeof rawRule.enabled !== 'boolean') throw new Error(`${ruleLabel}启用状态必须是布尔值。`);
      return { skill, condition, target, enabled: rawRule.enabled };
    });
    return { id, name, job, slot, rules };
  });
}
function validateDefinitions(input: unknown): Pick<GameContent, 'jobs' | 'skills'> {
  const raw = object(input, '内容');
  const rawJobs = object(raw.jobs, '职业配置');
  const rawSkills = object(raw.skills, '技能配置');
  const jobs = {} as Record<Job, JobDefinition>;
  const skills = {} as Record<Skill, SkillDefinition>;
  for (const key of JOB_KEYS) {
    const value = object(rawJobs[key], `${key} 职业`);
    const label = `${key} 职业`;
    jobs[key] = {
      name: text(value.name, `${label}名称`, 24), icon: text(value.icon, `${label}图标`, 12),
      hp: number(value.hp, `${label}生命`, 1, 999, true), atk: number(value.atk, `${label}攻击`, 1, 200, true),
      def: number(value.def, `${label}防御`, 0, 100, true), speed: number(value.speed, `${label}速度`, 1, 100, true),
      passive: text(value.passive, `${label}被动说明`, 160),
    };
  }
  for (const key of SKILL_KEYS) {
    const value = object(rawSkills[key], `${key} 技能`);
    const label = `${key} 技能`;
    skills[key] = {
      name: text(value.name, `${label}名称`, 24), cost: number(value.cost, `${label} AP 消耗`, 1, 3, true),
      power: number(value.power, `${label}伤害倍率`, key === 'heal' ? 0 : 0.1, key === 'heal' ? 0 : 5),
      healing: number(value.healing, `${label}治疗量`, key === 'heal' ? 1 : 0, key === 'heal' ? 300 : 0, true),
    };
  }
  return { jobs, skills };
}

/** Validate imported/local data before it reaches the simulation; discard unrecognized fields. */
export function validateContent(input: unknown): GameContent {
  const raw = object(input, '游戏内容');
  const definitions = validateDefinitions(raw);
  const squad = validateTeam(raw.squad, '远征队');
  if (!Array.isArray(raw.encounters) || raw.encounters.length !== 3) throw new Error('世界地图必须包含 3 个关卡。');
  const stages = raw.encounters.map((value, index) => {
    const label = `第 ${index + 1} 关`;
    const rawStage = object(value, label);
    const units = validateTeam(rawStage.units, `${label}敌方队伍`);
    if (units.some(enemy => squad.some(ally => ally.id === enemy.id))) throw new Error(`${label}的敌我角色 ID 必须唯一。`);
    return { name: text(rawStage.name, `${label}名称`, 40), subtitle: text(rawStage.subtitle, `${label}副标题`, 60), detail: text(rawStage.detail, `${label}说明`, 400, true), units };
  });
  return { ...definitions, squad, encounters: stages };
}

export function simulate(allies: Unit[], enemies: Unit[], content?: Pick<GameContent, 'jobs' | 'skills'>): Battle {
  validateTeam(allies, '我方队伍'); validateTeam(enemies, '敌方队伍');
  const { jobs, skills } = content ? validateDefinitions(content) : { jobs: JOBS, skills: SKILLS };
  if(new Set([...allies,...enemies].map(u=>u.id)).size !== allies.length+enemies.length) throw new Error('角色 ID 必须唯一');
  const fighters: Fighter[] = [...allies.map(u=>({...structuredClone(u),side:'ally' as const})),...enemies.map(u=>({...structuredClone(u),side:'enemy' as const}))].map(u=>({...u,hp:jobs[u.job].hp,maxHp:jobs[u.job].hp,ap:3,pp:2}));
  const frames: Frame[] = []; let round = 0;
  const record = (kind: Frame['kind'], text: string, actor?: string, target?: string, action?: ActionCue) => frames.push({round,text,kind,actor,target,units:structuredClone(fighters),...(action ? { action } : {})});
  const living = (side: Fighter['side']) => fighters.filter(u=>u.side===side && u.hp>0);
  const damage = (u: Fighter, amount: number) => { const n=Math.min(u.hp,amount); u.hp-=n; return n; };
  record('start','战斗开始 · 每轮恢复 3 AP / 2 PP；最多 8 轮。');
  for(round=1; round<=8; round++) {
    fighters.filter(u=>u.hp>0).forEach(u=>{u.ap=3;u.pp=2;});
    record('start',`第 ${round} 轮 · 行动点与被动点恢复`);
    const order=[...fighters].sort((a,b)=>jobs[b.job].speed-jobs[a.job].speed || a.id.localeCompare(b.id,'en'));
    for(let cycle=0;cycle<3;cycle++) for(const actor of order) {
      if(actor.hp<=0 || actor.ap<=0 || !living('ally').length || !living('enemy').length) continue;
      let chosen: { rule: Rule; target: Fighter } | undefined;
      for(const rule of actor.rules) {
        if(!rule.enabled || !skillsFor(actor.job).includes(rule.skill) || skills[rule.skill].cost>actor.ap || (rule.condition==='round2' && round<2)) continue;
        let candidates=living(rule.skill==='heal'? actor.side : actor.side==='ally'?'enemy':'ally');
        if(rule.skill!=='heal' && actor.job!=='bow') { const front=candidates.filter(u=>u.slot<3); if(front.length) candidates=front; }
        candidates=candidates.filter(u=>(rule.skill!=='heal'||u.hp<u.maxHp) && (rule.condition!=='hurt'||u.hp/u.maxHp<0.7) && (rule.condition!=='critical'||u.hp/u.maxHp<0.35));
        candidates.sort((a,b)=>{
          const ratio=a.hp/a.maxHp-b.hp/b.maxHp;
          return (rule.target==='lowest'?ratio:rule.target==='highest'?-ratio:rule.target==='back'?Number(b.slot>=3)-Number(a.slot>=3):Number(a.slot>=3)-Number(b.slot>=3)) || a.slot-b.slot;
        });
        if(candidates[0]) { chosen={rule,target:candidates[0]}; break; }
      }
      if(!chosen) continue;
      const {rule}=chosen; let target=chosen.target; actor.ap-=skills[rule.skill].cost;
      if(rule.skill==='heal') { const amount=Math.min(skills[rule.skill].healing,target.maxHp-target.hp); target.hp+=amount; record('heal',`${actor.name} → ${target.name} · ${skills[rule.skill].name} +${amount} HP`,actor.id,target.id,{effect:rule.skill,label:skills[rule.skill].name,amount,resource:'AP',cost:skills[rule.skill].cost}); continue; }
      let reduction=1;
      if(target.slot>=3) { const guard=living(target.side).find(u=>u.job==='guard'&&u.slot===target.slot-3&&u.pp>0); if(guard) {guard.pp--;target=guard;reduction=0.55; record('passive',`${guard.name} · 举盾掩护同列后排，减伤 45%`,guard.id,chosen.target.id,{effect:'cover',label:'举盾掩护',amount:0,resource:'PP',cost:1,incomingActor:actor.id});} }
      const power=skills[rule.skill].power;
      const defense=rule.skill==='pierce'?0:jobs[target.job].def;
      const amount=damage(target,Math.max(1,Math.round((jobs[actor.job].atk*power-defense)*reduction)));
      record('attack',`${actor.name} → ${target.name} · ${skills[rule.skill].name} −${amount} HP${target.hp===0?' · 倒下':''}`,actor.id,target.id,{effect:rule.skill,label:skills[rule.skill].name,amount,resource:'AP',cost:skills[rule.skill].cost,...(target.id!==chosen.target.id?{redirectedFrom:chosen.target.id}:{})});
      if(target.hp>0 && target.job==='sword' && target.pp>0) {target.pp--; const n=damage(actor,14);record('passive',`${target.name} · 反击 ${actor.name} −${n} HP`,target.id,actor.id,{effect:'counter',label:'反击',amount:n,resource:'PP',cost:1});}
      if(actor.hp>0 && actor.job==='bow' && actor.pp>0 && target.hp>0) {actor.pp--;const n=damage(target,8);record('passive',`${actor.name} · 追击 ${target.name} −${n} HP`,actor.id,target.id,{effect:'followup',label:'追击',amount:n,resource:'PP',cost:1});}
      for(const priest of fighters.filter(u=>u.hp>0&&u.job==='priest'&&u.pp>0)) { const wounded=living(priest.side).filter(u=>u.hp/u.maxHp<0.35).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0]; if(wounded) {priest.pp--; const n=Math.min(16,wounded.maxHp-wounded.hp);wounded.hp+=n;record('passive',`${priest.name} · 祈护 ${wounded.name} +${n} HP`,priest.id,wounded.id,{effect:'blessing',label:'祈护',amount:n,resource:'PP',cost:1});} }
    }
    if(!living('ally').length || !living('enemy').length) break;
  }
  const winner=!living('enemy').length?'ally':!living('ally').length?'enemy':'draw';
  round=Math.min(round,8);record('end',winner==='ally'?'胜利 · 道路已畅通':winner==='enemy'?'战败 · 调整阵型与战术后再试':'僵持 · 8 轮内未分胜负');
  return {frames,winner,rounds:round};
}
