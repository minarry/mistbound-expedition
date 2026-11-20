import { useState, type FormEvent } from 'react';
import { type GameContent, type Job, type Skill, type Unit, JOBS, defaultRules, skillsFor, validateContent } from './core/battle';
import './editor.css';

type EditorTab = 'characters' | 'skills' | 'levels';
interface ContentEditorProps {
  content: GameContent;
  initialTab: EditorTab;
  onSave: (content: GameContent) => void;
  onClose: () => void;
}

const jobKeys = Object.keys(JOBS) as Job[];
const skillKeys: Skill[] = ['strike', 'heavy', 'pierce', 'heal'];
const skillLabels: Record<Skill, string> = { strike: '普通攻击', heavy: '破阵斩', pierce: '穿透箭', heal: '愈合术' };
const tabs: { id: EditorTab; label: string; symbol: string; hint: string }[] = [
  { id: 'characters', label: '角色档案', symbol: '♙', hint: '职业属性与远征队员' },
  { id: 'skills', label: '技能工坊', symbol: '✦', hint: '行动消耗与技能效果' },
  { id: 'levels', label: '关卡沙盘', symbol: '◇', hint: '战场情报与敌方阵容' },
];
const slotLabels = ['前排 · 左', '前排 · 中', '前排 · 右', '后排 · 左', '后排 · 中', '后排 · 右'];

function NumberField({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void;
}) {
  return <label className="content-field"><span>{label}</span><input type="number" min={min} max={max} step={step} value={Number.isFinite(value) ? value : ''} required onChange={event => onChange(event.currentTarget.valueAsNumber)} /></label>;
}

export default function ContentEditor({ content, initialTab, onSave, onClose }: ContentEditorProps) {
  const [draft, setDraft] = useState<GameContent>(() => structuredClone(content));
  const [tab, setTab] = useState<EditorTab>(initialTab);
  const [levelIndex, setLevelIndex] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);

  function edit(update: (next: GameContent) => void) {
    setDraft(previous => {
      const next = structuredClone(previous);
      update(next);
      return next;
    });
    setDirty(true);
    setErrors([]);
  }

  function changeUnit(team: 'squad' | 'enemies', index: number, update: (unit: Unit) => void) {
    edit(next => update((team === 'squad' ? next.squad : next.encounters[levelIndex].units)[index]));
  }

  function changeJob(team: 'squad' | 'enemies', index: number, job: Job) {
    changeUnit(team, index, unit => { unit.job = job; unit.rules = defaultRules(job); });
  }

  function moveEnemy(index: number, slot: number) {
    edit(next => {
      const units = next.encounters[levelIndex].units;
      const other = units.find(unit => unit.slot === slot);
      if (other) other.slot = units[index].slot;
      units[index].slot = slot;
    });
  }

  function addEnemy() {
    edit(next => {
      const units = next.encounters[levelIndex].units;
      if (units.length >= 6) return;
      const slot = Array.from({ length: 6 }, (_, i) => i).find(i => !units.some(unit => unit.slot === i))!;
      let suffix = 1;
      const ids = new Set([...next.squad, ...units].map(unit => unit.id));
      while (ids.has(`custom-enemy-${levelIndex}-${suffix}`)) suffix++;
      units.push({ id: `custom-enemy-${levelIndex}-${suffix}`, name: '新晋守卫', job: 'guard', slot, rules: defaultRules('guard') });
    });
  }

  function save(event: FormEvent) {
    event.preventDefault();
    try {
      const validated = validateContent(draft);
      onSave(validated);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : '内容格式有误，请检查后重试。']);
    }
  }

  const level = draft.encounters[levelIndex];
  const currentTab = tabs.find(item => item.id === tab)!;

  return <div className="content-editor">
    <div className="content-topbar">
      <span className="content-topbar-title">远征工坊 <span>/</span> 内容编辑</span>
      <span className="content-draft-status">{dirty ? '● 草稿尚未保存' : '本地内容档案'}</span>
    </div>
    <form className="content-shell" onSubmit={save} noValidate>
      <div className="content-layout">
        <nav className="content-navigation" aria-label="内容编辑分类">
          {tabs.map(item => <button type="button" key={item.id} className={`content-tab ${tab === item.id ? 'content-tab-active' : ''}`} aria-pressed={tab === item.id} onClick={() => setTab(item.id)}><span className="content-tab-symbol">{item.symbol}</span><span><strong>{item.label}</strong><small>{item.hint}</small></span><span className="content-tab-arrow">↗</span></button>)}
          
        </nav>
        <section className="content-panel" key={tab} aria-label={currentTab.label} tabIndex={0}>
          <div className="content-panel-heading"><div><h2>{currentTab.label}</h2></div><span className="content-panel-symbol" aria-hidden="true">{currentTab.symbol}</span></div>

          {tab === 'characters' && <>
            <p className="content-description">四种职业，共同构成远征队的骨架。属性调整会作用于使用该职业的所有角色。</p>
            <div className="content-job-grid">{jobKeys.map(job => {
              const definition = draft.jobs[job];
              return <fieldset key={job} className="content-job-card"><legend><span>{definition.icon}</span> {definition.name}</legend><div className="content-stat-grid">
                <NumberField label={`${definition.name}生命`} value={definition.hp} min={1} max={999} onChange={value => edit(next => { next.jobs[job].hp = value; })} />
                <NumberField label={`${definition.name}攻击`} value={definition.atk} min={1} max={200} onChange={value => edit(next => { next.jobs[job].atk = value; })} />
                <NumberField label={`${definition.name}防御`} value={definition.def} min={0} max={100} onChange={value => edit(next => { next.jobs[job].def = value; })} />
                <NumberField label={`${definition.name}速度`} value={definition.speed} min={1} max={100} onChange={value => edit(next => { next.jobs[job].speed = value; })} />
              </div><p className="content-passive">{definition.passive}</p></fieldset>;
            })}</div>
            <div className="content-subheading"><h3>起始远征队</h3><span>阵型与战术可在大地图继续调整</span></div>
            <div className="content-roster">{draft.squad.map((unit, index) => <div key={unit.id} className="content-roster-row"><span className="content-roster-icon" aria-hidden="true">{draft.jobs[unit.job].icon}</span><label className="content-field"><span>队员 {index + 1} 姓名</span><input type="text" maxLength={24} value={unit.name} onChange={event => changeUnit('squad', index, current => { current.name = event.target.value; })} /></label><label className="content-field"><span>队员 {index + 1} 职业</span><select aria-label={`队员 ${index + 1} 职业`} value={unit.job} onChange={event => changeJob('squad', index, event.target.value as Job)}>{jobKeys.map(job => <option value={job} key={job}>{draft.jobs[job].name}</option>)}</select></label><span className="content-position">{slotLabels[unit.slot]}</span></div>)}</div>
          </>}

          {tab === 'skills' && <>
            <p className="content-description">每轮角色恢复 3 AP。技能按战术优先级触发，消耗与效果数值将直接参与战斗推演。</p>
            <div className="content-skills">{skillKeys.map(skill => {
              const definition = draft.skills[skill];
              const professions = jobKeys.filter(job => skillsFor(job).includes(skill)).map(job => draft.jobs[job].name);
              return <fieldset className="content-skill-card" key={skill}><legend>{skill === 'heal' ? '✧' : '⚔'} {definition.name || '未命名技能'}</legend><div className="content-skill-fields"><label className="content-field"><span>{skillLabels[skill]}名称</span><input type="text" maxLength={24} value={definition.name} onChange={event => edit(next => { next.skills[skill].name = event.target.value; })} /></label><NumberField label={`${skillLabels[skill]} AP 消耗`} value={definition.cost} min={1} max={3} onChange={value => edit(next => { next.skills[skill].cost = value; })} />{skill === 'heal' ? <NumberField label="治疗恢复量" value={definition.healing} min={1} max={300} onChange={value => edit(next => { next.skills[skill].healing = value; })} /> : <NumberField label={`${skillLabels[skill]}攻击倍率`} value={definition.power} min={0.1} max={5} step={0.05} onChange={value => edit(next => { next.skills[skill].power = value; })} />}</div><div className="content-skill-caption"><span>可用职业 · {professions.join(' / ')}</span><span>{skill === 'heal' ? '恢复固定生命值' : skill === 'pierce' ? '忽略目标防御' : '攻击 × 倍率 − 目标防御'}</span></div></fieldset>;
            })}</div>
            <div className="content-help"><strong>关于被动技能</strong><p>反击、掩护、追击与祈护沿用各职业的固定规则，每轮恢复 2 PP。此处只编辑可在战术中配置的主动技能。</p></div>
          </>}

          {tab === 'levels' && <>
            <p className="content-description">三个战场对应大地图上的三个据点。调整敌军的构成，设计属于你的战术挑战。</p>
            <div className="content-level-tabs" aria-label="选择编辑关卡">{draft.encounters.map((encounter, index) => <button type="button" key={index} aria-pressed={levelIndex === index} className={levelIndex === index ? 'content-level-active' : ''} onClick={() => setLevelIndex(index)}><span>0{index + 1}</span>{encounter.name || '未命名关卡'}</button>)}</div>
            <div className="content-level-fields"><label className="content-field"><span>关卡名称</span><input maxLength={40} value={level.name} onChange={event => edit(next => { next.encounters[levelIndex].name = event.target.value; })} /></label><label className="content-field"><span>关卡副标题</span><input maxLength={60} value={level.subtitle} onChange={event => edit(next => { next.encounters[levelIndex].subtitle = event.target.value; })} /></label><label className="content-field content-field-wide"><span>战场简介</span><textarea rows={3} maxLength={400} value={level.detail} onChange={event => edit(next => { next.encounters[levelIndex].detail = event.target.value; })} /></label></div>
            <div className="content-subheading"><h3>敌方编队 <span>{level.units.length} / 6</span></h3><button type="button" onClick={addEnemy} disabled={level.units.length >= 6}>＋ 添加敌军</button></div>
            <div className="content-enemy-layout"><div className="content-enemy-rows">{level.units.map((unit, index) => <div className="content-enemy-row" key={unit.id}><span className="content-enemy-number">{String(index + 1).padStart(2, '0')}</span><label className="content-field"><span>敌军 {index + 1} 姓名</span><input maxLength={24} value={unit.name} onChange={event => changeUnit('enemies', index, current => { current.name = event.target.value; })} /></label><label className="content-field"><span>敌军 {index + 1} 职业</span><select aria-label={`敌军 ${index + 1} 职业`} value={unit.job} onChange={event => changeJob('enemies', index, event.target.value as Job)}>{jobKeys.map(job => <option value={job} key={job}>{draft.jobs[job].name}</option>)}</select></label><label className="content-field"><span>敌军 {index + 1} 阵位</span><select aria-label={`敌军 ${index + 1} 阵位`} value={unit.slot} onChange={event => moveEnemy(index, Number(event.target.value))}>{slotLabels.map((label, slot) => <option key={slot} value={slot}>{label}</option>)}</select></label><button className="content-remove" type="button" aria-label={`移除敌军 ${index + 1}`} disabled={level.units.length <= 1} onClick={() => edit(next => { next.encounters[levelIndex].units.splice(index, 1); })}>×</button></div>)}</div><div className="content-formation-preview"><span className="content-formation-title">敌方阵型预览</span><div className="content-preview-grid">{slotLabels.map((label, slot) => { const unit = level.units.find(current => current.slot === slot); return <div className={`content-preview-slot ${unit ? 'content-preview-filled' : ''}`} key={slot}><small>{label}</small><span>{unit ? draft.jobs[unit.job].icon : '·'}</span><strong>{unit?.name || '空位'}</strong></div>; })}</div><p>选择已占用阵位时，两名角色互换位置。</p></div></div>
          </>}
        </section>
      </div>
      {errors.length > 0 && <div className="content-errors" role="alert"><strong>请先修正以下内容</strong><ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}
      <div className="content-actions"><p>保存将重置远征进度，应用全部三个分类的修改。</p><div><button type="button" onClick={onClose}>取消并返回</button><button className="content-save" type="submit">保存内容并返回 <span>↗</span></button></div></div>
    </form>
  </div>;
}
