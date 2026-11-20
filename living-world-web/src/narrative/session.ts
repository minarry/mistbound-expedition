import { createDefaultContent, unit, validateContent, type Battle, type GameContent, type Unit } from '../core/battle';
import type { DialogueLine, StoryBook, StoryLevel } from './types';

export const STORY_SAVE_KEY = 'mistbound.shanhe.v1';
export interface LevelProgress {
  current: string; visited: string[]; resolved: string[]; choices: Record<string, string>;
  entered: boolean; completed: boolean;
  lastBattle?: { winner: Battle['winner']; needsDebrief: boolean };
  pausedDialogue?: PendingDialogue;
}
export interface PendingDialogue { kind: 'intro' | 'node' | 'after' | 'choice' | 'outro' | 'failure'; levelId: string; nodeId?: string; choiceId?: string; line: number }
export interface StorySession { version: 1; bookId: string; view: 'atlas' | 'level'; levelId: string; progress: Record<string, LevelProgress>; team: Unit[]; pending: PendingDialogue | null }
export type StoryCommand =
  | { type: 'enter'; levelId: string } | { type: 'atlas' } | { type: 'move'; nodeId: string }
  | { type: 'complete' } | { type: 'choose'; choiceId: string } | { type: 'next' } | { type: 'skip' }
  | { type: 'team'; team: Unit[] } | { type: 'failure' } | { type: 'battle-result'; winner: Battle['winner'] };

export function narrativeContent(): GameContent {
  const content = createDefaultContent();
  content.jobs.sword.name = '步兵'; content.jobs.guard.name = '掩护手'; content.jobs.bow.name = '射手'; content.jobs.priest.name = '卫生员';
  content.skills.strike.name = '掩护射击'; content.skills.heavy.name = '集中火力'; content.skills.pierce.name = '远程射击'; content.skills.heal.name = '紧急救护';
  content.squad = [unit('sh-luo', '罗石', 'sword', 1), unit('sh-shen', '沈砚', 'guard', 0), unit('sh-he', '阿禾', 'bow', 5), unit('sh-tian', '田穗', 'priest', 3)];
  return content;
}
export function newStorySession(book: StoryBook): StorySession {
  return { version: 1, bookId: book.id, view: 'atlas', levelId: book.levels[0].id, progress: {}, team: narrativeContent().squad, pending: null };
}
export function unlockedLevels(book: StoryBook, state: StorySession): string[] {
  return book.levels.filter((_, i) => i === 0 || book.levels.slice(0, i).every(l => state.progress[l.id]?.completed)).map(l => l.id);
}
export function missingObjectives(level: StoryLevel, progress: LevelProgress): string[] {
  return level.nodes.filter(n => n.id !== level.exit && !n.optional && !progress.resolved.includes(n.id)).map(n => n.id);
}
export function canMove(level: StoryLevel, progress: LevelProgress, nodeId: string): boolean {
  if (nodeId === progress.current || !progress.resolved.includes(progress.current)) return false;
  if (!level.edges.some(e => e.from === progress.current && e.to === nodeId || e.to === progress.current && e.from === nodeId)) return false;
  return nodeId !== level.exit || !missingObjectives(level, progress).length;
}
/** First legal step toward the nearest unfinished main objective, including revisits at a fork. */
export function nextStoryStop(level: StoryLevel, progress: LevelProgress) {
  if (!progress.resolved.includes(progress.current)) return;
  const missing = missingObjectives(level, progress);
  const goals = new Set(missing.length ? missing : [level.exit]);
  const seen = new Set([progress.current]);
  const queue = [{ id: progress.current, step: '' }];
  for (const from of queue) {
    for (const edge of level.edges) {
      const id = edge.from === from.id ? edge.to : edge.to === from.id ? edge.from : undefined;
      if (!id || seen.has(id) || (id === level.exit && missing.length)) continue;
      seen.add(id);
      const step = from.step || id;
      if (goals.has(id)) return level.nodes.find(n => n.id === step);
      queue.push({ id, step });
    }
  }
}
export function dialogueLines(book: StoryBook, pending: PendingDialogue | null): DialogueLine[] {
  if (!pending) return [];
  const level = book.levels.find(l => l.id === pending.levelId);
  if (!level) return [];
  if (pending.kind === 'intro' || pending.kind === 'outro' || pending.kind === 'failure') return level[pending.kind];
  const node = level.nodes.find(n => n.id === pending.nodeId);
  if (!node) return [];
  if (pending.kind === 'node') return node.dialogue;
  if (pending.kind === 'choice') return [...(node.choices?.find(c => c.id === pending.choiceId)?.lines || []), ...node.after];
  return node.after;
}
const add = (items: string[], id: string) => items.includes(id) ? items : [...items, id];
function finishDialogue(book: StoryBook, state: StorySession): StorySession {
  const pending = state.pending;
  if (!pending) return state;
  const level = book.levels.find(l => l.id === pending.levelId)!;
  const progress = state.progress[level.id];
  let next: LevelProgress = progress;
  let dialog: PendingDialogue | null = null;
  if (pending.kind === 'intro') {
    next = { ...progress, entered: true };
    dialog = { kind: 'node', levelId: level.id, nodeId: progress.current, line: 0 };
  } else if (pending.kind === 'after' || pending.kind === 'choice') {
    next = { ...progress, resolved: add(progress.resolved, pending.nodeId!) };
    if (next.lastBattle?.needsDebrief) next.lastBattle = { ...next.lastBattle, needsDebrief: false };
    if (pending.nodeId === level.exit) dialog = { kind: 'outro', levelId: level.id, line: 0 };
  } else if (pending.kind === 'outro') next = { ...progress, completed: true };
  return { ...state, progress: { ...state.progress, [level.id]: next }, pending: dialog };
}
/** The only place narrative progress changes. Rendering and tactical animations do not resolve nodes. */
export function dispatchStory(book: StoryBook, state: StorySession, command: StoryCommand): StorySession {
  if (command.type === 'next' || command.type === 'skip') {
    if (!state.pending) return state;
    const lines = dialogueLines(book, state.pending);
    return command.type === 'skip' || state.pending.line >= lines.length - 1 ? finishDialogue(book, state) : { ...state, pending: { ...state.pending, line: state.pending.line + 1 } };
  }
  if (command.type === 'atlas') {
    if (!state.pending) return { ...state, view: 'atlas' };
    const id = state.levelId;
    const progress = { ...state.progress[id], pausedDialogue: state.pending };
    return { ...state, view: 'atlas', pending: null, progress: { ...state.progress, [id]: progress } };
  }
  if (state.pending) return state;
  if (command.type === 'team') {
    const team = validateContent({ ...narrativeContent(), squad: command.team }).squad;
    return { ...state, team };
  }
  if (command.type === 'enter') {
    if (!unlockedLevels(book, state).includes(command.levelId)) return state;
    const level = book.levels.find(l => l.id === command.levelId)!;
    const stored = state.progress[level.id] || { current: level.entry, visited: [level.entry], resolved: [], choices: {}, entered: false, completed: false };
    const { pausedDialogue, ...progress } = stored;
    const pending = pausedDialogue ?? (progress.entered ? null : { kind: 'intro' as const, levelId: level.id, line: 0 });
    return { ...state, view: 'level', levelId: level.id, progress: { ...state.progress, [level.id]: progress }, pending };
  }
  if (state.view !== 'level') return state;
  const level = book.levels.find(l => l.id === state.levelId)!;
  const progress = state.progress[level.id];
  if (!progress) return state;
  const node = level.nodes.find(n => n.id === progress.current)!;
  if (command.type === 'battle-result') {
    if (node.kind !== 'battle') return state;
    const needsDebrief = command.winner !== 'ally' && !progress.resolved.includes(node.id);
    if (progress.lastBattle?.winner === command.winner && progress.lastBattle.needsDebrief === needsDebrief) return state;
    const next = { ...progress, lastBattle: { winner: command.winner, needsDebrief } };
    return { ...state, progress: { ...state.progress, [level.id]: next } };
  }
  if (command.type === 'failure') {
    if (node.kind !== 'battle' || !progress.lastBattle?.needsDebrief || progress.resolved.includes(node.id)) return state;
    const next = { ...progress, lastBattle: { ...progress.lastBattle, needsDebrief: false } };
    return { ...state, progress: { ...state.progress, [level.id]: next }, pending: { kind: 'failure', levelId: level.id, nodeId: node.id, line: 0 } };
  }
  if (command.type === 'move') {
    if (!canMove(level, progress, command.nodeId)) return state;
    const next = { ...progress, current: command.nodeId, visited: add(progress.visited, command.nodeId) };
    delete next.lastBattle;
    return { ...state, progress: { ...state.progress, [level.id]: next }, pending: progress.resolved.includes(command.nodeId) ? null : { kind: 'node', levelId: level.id, nodeId: command.nodeId, line: 0 } };
  }
  if (progress.resolved.includes(node.id)) return state;
  if (command.type === 'choose') {
    if (node.kind !== 'choice' || !node.choices?.some(c => c.id === command.choiceId)) return state;
    return { ...state, progress: { ...state.progress, [level.id]: { ...progress, choices: { ...progress.choices, [node.id]: command.choiceId } } }, pending: { kind: 'choice', levelId: level.id, nodeId: node.id, choiceId: command.choiceId, line: 0 } };
  }
  if (command.type === 'complete' && node.kind !== 'choice') {
    if (node.id === level.exit && missingObjectives(level, progress).length) return state;
    return { ...state, pending: { kind: 'after', levelId: level.id, nodeId: node.id, line: 0 } };
  }
  return state;
}

export function decodeStorySave(book: StoryBook, raw: string): StorySession {
  const data = JSON.parse(raw) as StorySession;
  const fail = (): never => { throw new Error('剧情存档内容不完整或不匹配'); };
  if (!data || data.version !== 1 || data.bookId !== book.id || !['atlas', 'level'].includes(data.view) || !book.levels.some(l => l.id === data.levelId) || !data.progress || typeof data.progress !== 'object' || Array.isArray(data.progress)) fail();
  const progress: Record<string, LevelProgress> = {};
  for (const [id, p] of Object.entries(data.progress)) {
    const level = book.levels.find(l => l.id === id);
    if (!level || !p || typeof p.entered !== 'boolean' || typeof p.completed !== 'boolean' || !p.choices || typeof p.choices !== 'object' || Array.isArray(p.choices)) fail();
    const scene = level!;
    const validIds = scene.nodes.map(n => n.id);
    for (const ids of [p.visited, p.resolved]) if (!Array.isArray(ids) || ids.some(id => !validIds.includes(id)) || new Set(ids).size !== ids.length) fail();
    if (!p.visited.includes(scene.entry) || !p.visited.includes(p.current) || p.resolved.some(id => !p.visited.includes(id))) fail();
    // Movement only leaves resolved nodes; an unfinished place cannot appear behind the party.
    if (p.visited.some(id => id !== p.current && !p.resolved.includes(id))) fail();
    if (!p.entered && (p.current !== scene.entry || p.visited.length !== 1 || p.resolved.length || Object.keys(p.choices).length || p.completed)) fail();
    if (p.visited.includes(scene.exit) && missingObjectives(scene, p).length) fail();
    // Every visited place must be connected through already visited places.
    const connected = new Set([scene.entry]);
    for (let i = 0; i < p.visited.length; i++) for (const e of scene.edges) {
      if (connected.has(e.from) && p.visited.includes(e.to)) connected.add(e.to);
      if (connected.has(e.to) && p.visited.includes(e.from)) connected.add(e.from);
    }
    if (connected.size !== p.visited.length) fail();
    const choices: Record<string, string> = {};
    for (const [nodeId, choiceId] of Object.entries(p.choices)) {
      if (!p.visited.includes(nodeId) || !scene.nodes.find(n => n.id === nodeId && n.kind === 'choice')?.choices?.some(c => c.id === choiceId)) fail();
      choices[nodeId] = choiceId;
    }
    if (scene.nodes.some(n => n.kind === 'choice' && p.resolved.includes(n.id) && !choices[n.id])) fail();
    if (p.completed && (!p.entered || !p.resolved.includes(scene.exit) || missingObjectives(scene, p).length)) fail();
    progress[id] = { current: p.current, visited: [...p.visited], resolved: [...p.resolved], choices, entered: p.entered, completed: p.completed };
    if (p.lastBattle !== undefined) {
      const battle = p.lastBattle;
      if (!battle || !['ally','enemy','draw'].includes(battle.winner) || typeof battle.needsDebrief !== 'boolean' ||
          (battle.needsDebrief && battle.winner === 'ally') || scene.nodes.find(n => n.id === p.current)?.kind !== 'battle') fail();
      progress[id].lastBattle = { winner: battle.winner, needsDebrief: battle.needsDebrief && !p.resolved.includes(p.current) };
    }
  }
  const team = validateContent({ ...narrativeContent(), squad: data.team }).squad;
  function decodeDialogue(p: PendingDialogue, levelId: string): PendingDialogue {
    if (!p || !['intro', 'node', 'after', 'choice', 'outro', 'failure'].includes(p.kind) || p.levelId !== levelId || !Number.isInteger(p.line)) fail();
    const restored = { kind: p.kind, levelId: p.levelId, line: p.line, ...(p.nodeId ? { nodeId: p.nodeId } : {}), ...(p.choiceId ? { choiceId: p.choiceId } : {}) };
    const lines = dialogueLines(book, restored);
    const level = book.levels.find(l => l.id === p.levelId)!;
    const lp = progress[p.levelId];
    if (!lp || p.line < 0 || p.line >= lines.length || p.nodeId && p.nodeId !== lp.current) fail();
    const node = level.nodes.find(n => n.id === lp.current)!;
    if (p.kind !== 'intro' && !lp.entered) fail();
    if (p.kind !== 'choice' && p.choiceId !== undefined) fail();
    if (p.kind === 'intro' && (lp.entered || p.nodeId !== undefined)) fail();
    if (['node', 'after', 'choice', 'failure'].includes(p.kind) && p.nodeId !== lp.current) fail();
    if (['node', 'after', 'choice'].includes(p.kind) && lp.resolved.includes(lp.current)) fail();
    if (p.kind === 'after' && node.kind === 'choice' || p.kind === 'choice' && node.kind !== 'choice') fail();
    if (p.kind === 'failure' && node.kind !== 'battle') fail();
    if (p.kind === 'choice' && lp.choices[p.nodeId!] !== p.choiceId) fail();
    if (p.kind === 'outro' && (lp.completed || lp.current !== level.exit || p.nodeId !== undefined || !lp.resolved.includes(level.exit) || missingObjectives(level, lp).length)) fail();
    return restored;
  }
  if (data.pending !== null && data.view !== 'level') fail();
  const pending = data.pending === null ? null : decodeDialogue(data.pending, data.levelId);
  for (const [id, lp] of Object.entries(progress)) {
    const level = book.levels.find(l => l.id === id)!;
    const savedDialogue = data.progress[id].pausedDialogue;
    if (savedDialogue !== undefined) {
      if (data.view === 'level' && data.levelId === id) fail();
      lp.pausedDialogue = decodeDialogue(savedDialogue, id);
    }
    const dialogue = lp.pausedDialogue ?? (pending?.levelId === id ? pending : null);
    if (!lp.entered && dialogue?.kind !== 'intro') fail();
    if (!lp.completed && lp.resolved.includes(level.exit) && dialogue?.kind !== 'outro') fail();
    if (Object.keys(lp.choices).some(nodeId => !lp.resolved.includes(nodeId) && !(dialogue?.kind === 'choice' && dialogue.nodeId === nodeId))) fail();
  }
  const result: StorySession = { version: 1, bookId: book.id, view: data.view, levelId: data.levelId, progress, team, pending };
  const unlocked = unlockedLevels(book, result);
  if (Object.keys(progress).some(id => !unlocked.includes(id)) || data.view === 'level' && !progress[data.levelId]) fail();
  return result;
}
