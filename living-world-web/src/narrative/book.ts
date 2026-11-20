import meta from '../../data/scenarios/shanhe-book.json';
import early from '../../data/scenarios/shanhe-early.json';
import late from '../../data/scenarios/shanhe-late.json';
import type { StoryBook } from './types';

export const storyBook = { ...meta, sources: [...early.sources, ...late.sources], levels: [...early.levels, ...late.levels] } as StoryBook;

/** Content invariants are checked in tests and on import, before entering a saved scene. */
export function validateBook(book: StoryBook): void {
  const unique = (ids: string[], label: string) => { if (new Set(ids).size !== ids.length) throw new Error(`${label}编号重复`); };
  unique(book.levels.map(l => l.id), '关卡'); unique(book.chapters.map(c => c.id), '章节'); unique(book.sources.map(s => s.id), '来源');
  const assigned = book.chapters.flatMap(c => c.levels);
  unique(assigned, '章节关卡');
  if (assigned.length !== book.levels.length || assigned.some((id, i) => id !== book.levels[i].id)) throw new Error('章节顺序与关卡不匹配');
  for (const level of book.levels) {
    if (!book.chapters.find(c => c.id === level.chapterId)?.levels.includes(level.id)) throw new Error('章节归属错误');
    unique(level.nodes.map(n => n.id), '节点');
    if (!level.nodes.some(n => n.id === level.entry) || !level.nodes.some(n => n.id === level.exit && n.kind === 'exit')) throw new Error('缺少入口或出口');
    if (!level.intro.length || !level.outro.length || !level.failure.length || !level.sources.length) throw new Error('关卡叙事不完整');
    if (level.sources.some(id => !book.sources.some(s => s.id === id))) throw new Error('来源引用不存在');
    for (const node of level.nodes) {
      if (![node.x, node.y].every(n => Number.isFinite(n) && n >= 0 && n <= 100) || !node.dialogue.length || !node.after.length) throw new Error('节点内容不完整');
      if (node.kind === 'choice' && (!node.choices || node.choices.length < 2 || node.choices.some(c => !c.lines.length || !c.flag))) throw new Error('选择缺少回应');
      if (node.choices) unique(node.choices.map(c => c.id), '选择');
    }
    const connected = new Set([level.entry]);
    for (const edge of level.edges) if (edge.from === edge.to || !level.nodes.some(n => n.id === edge.from) || !level.nodes.some(n => n.id === edge.to)) throw new Error('路线端点错误');
    for (let pass = 0; pass < level.nodes.length; pass++) for (const edge of level.edges) {
      if (connected.has(edge.from)) connected.add(edge.to);
      if (connected.has(edge.to)) connected.add(edge.from);
    }
    if (connected.size !== level.nodes.length) throw new Error('地图存在不可达节点');
  }
}
validateBook(storyBook);
