import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initialSave, SAVE_KEY } from '../campaign';
import { canMove, decodeStorySave, dialogueLines, dispatchStory, missingObjectives, newStorySession, nextStoryStop, STORY_SAVE_KEY, unlockedLevels, type StoryCommand, type StorySession } from './session';
import type { DialogueLine, StoryBook, StoryLevel, StoryNode } from './types';

// Gameplay abstraction for transition tests; these names and routes are not historical scenes.
const line = (text: string): DialogueLine => ({speaker:'测试旁白',text,kind:'narration'});
const node = (id: string, kind: StoryNode['kind'], optional = false): StoryNode => ({id,name:id,kind,x:20,y:30,summary:'测试节点',objective:'完成测试节点',dialogue:[line(`${id} arrival`),line(`${id} detail`)],after:[line(`${id} resolved`)],optional});
const fixtureLevel: StoryLevel = {
  id:'fixture-one',chapterId:'fixture-chapter',title:'玩法抽象测试关',period:'测试时间',location:'测试地图',world:{x:30,y:30},
  objective:'验证选择、回头与出口门槛',background:'纯测试夹具，不对应史实。',historicalNotes:[],sources:['fixture-source'],
  style:{palette:'测试',weather:'测试',lighting:'测试',sound:'测试',composition:'测试'},
  map:{terrain:'village',labels:[],routeNote:'玩法抽象'},intro:[line('intro 1'),line('intro 2')],outro:[line('outro 1'),line('outro 2')],failure:[line('retry without clearing')],
  entry:'entry',exit:'exit',nodes:[node('entry','story'),{...node('choice','choice'),choices:[{id:'listen',label:'听取意见',text:'测试第一回应',flag:'listened',lines:[line('choice response A')]},{id:'record',label:'登记情况',text:'测试第二回应',flag:'recorded',lines:[line('choice response B')]}]},node('battle','battle'),node('camp','camp',true),node('exit','exit')],
  edges:[{from:'entry',to:'choice'},{from:'choice',to:'battle'},{from:'choice',to:'camp'},{from:'battle',to:'exit'},{from:'choice',to:'exit'}],
};
const fixture: StoryBook = {
  id:'gameplay-abstraction',title:'测试书',subtitle:'测试',period:'测试',premise:'玩法抽象',sourceNotes:['测试夹具不对应历史事件'],cast:[],
  sources:[{id:'fixture-source',title:'测试夹具',type:'history',note:'玩法抽象'}],
  chapters:[{id:'fixture-chapter',title:'测试章节',period:'测试',summary:'测试',theme:'测试',region:'测试',levels:['fixture-one','fixture-two']}],
  levels:[fixtureLevel,{...structuredClone(fixtureLevel),id:'fixture-two'}],
};

function freeze<T>(value:T):T {
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}
  return value;
}

/** Every exercised command must preserve the supplied snapshot and produce a resumable save. */
function send(book:StoryBook,state:StorySession,command:StoryCommand):StorySession {
  const before=JSON.stringify(state);
  const result=dispatchStory(book,freeze(state),command);
  expect(JSON.stringify(state)).toBe(before);
  expect(decodeStorySave(book,JSON.stringify(result))).toEqual(result);
  return result;
}
function closeDialogues(book:StoryBook,state:StorySession):StorySession {
  let guard=0;
  while(state.pending){
    expect(++guard).toBeLessThan(100);
    const lines=dialogueLines(book,state.pending);
    expect(lines[state.pending.line]).toBeDefined();
    state=send(book,state,{type:'next'});
  }
  return state;
}
function completeCurrent(book:StoryBook,state:StorySession,choiceIndex=0):StorySession {
  state=closeDialogues(book,state);
  const level=book.levels.find(l=>l.id===state.levelId)!;
  const progress=state.progress[level.id];
  if(progress.resolved.includes(progress.current))return state;
  const current=level.nodes.find(n=>n.id===progress.current)!;
  return closeDialogues(book,send(book,state,current.kind==='choice'?{type:'choose',choiceId:current.choices![choiceIndex].id}:{type:'complete'}));
}
function path(level:StoryLevel,start:string,end:string):string[] {
  const queue=[[start]],seen=new Set([start]);
  while(queue.length){
    const route=queue.shift()!,last=route.at(-1)!;
    if(last===end)return route;
    for(const edge of level.edges){
      const next=edge.from===last?edge.to:edge.to===last?edge.from:undefined;
      if(next&&!seen.has(next)&&(next!==level.exit||end===level.exit)){seen.add(next);queue.push([...route,next]);}
    }
  }
  throw new Error(`${level.id}: ${start} cannot reach ${end} before exiting`);
}
/** Follow real edges, resolving intermediate places; never edit progress to teleport. */
function travel(book:StoryBook,state:StorySession,target:string):StorySession {
  const level=book.levels.find(l=>l.id===state.levelId)!;
  for(const next of path(level,state.progress[level.id].current,target).slice(1)){
    state=completeCurrent(book,state);
    expect(canMove(level,state.progress[level.id],next)).toBe(true);
    state=closeDialogues(book,send(book,state,{type:'move',nodeId:next}));
    expect(state.progress[level.id].current).toBe(next);
  }
  return state;
}
function begin(book:StoryBook=fixture):StorySession {
  return closeDialogues(book,send(book,newStorySession(book),{type:'enter',levelId:book.levels[0].id}));
}
function toChoice():StorySession {
  return travel(fixture,completeCurrent(fixture,begin()),'choice');
}

describe('narrative session commands and saves',()=>{
  it('keeps narrative saves independent from the original expedition',()=>{
    expect(STORY_SAVE_KEY).not.toBe(SAVE_KEY);
    expect(STORY_SAVE_KEY).toBe('mistbound.shanhe.v1');
    const old=initialSave();
    expect(()=>decodeStorySave(fixture,JSON.stringify(old))).toThrow();
    expect(old.campaign.team[0].name).toBe('莱恩');
    expect(newStorySession(fixture).team.map(u=>u.name)).toEqual(['罗石','沈砚','阿禾','田穗']);
  });
  it('rejects locked levels, unknown levels, movement from atlas and skipped nodes',()=>{
    const initial=newStorySession(fixture);
    expect(dispatchStory(fixture,initial,{type:'enter',levelId:'fixture-two'})).toBe(initial);
    expect(dispatchStory(fixture,initial,{type:'enter',levelId:'missing'})).toBe(initial);
    expect(dispatchStory(fixture,initial,{type:'move',nodeId:'battle'})).toBe(initial);
    let state=begin();
    expect(dispatchStory(fixture,state,{type:'move',nodeId:'choice'})).toBe(state);
    state=completeCurrent(fixture,state);
    expect(dispatchStory(fixture,state,{type:'move',nodeId:'battle'})).toBe(state);
    expect(dispatchStory(fixture,state,{type:'move',nodeId:'missing'})).toBe(state);
  });
  it('resumes an exact intro, node, response and outro line without advancing progress',()=>{
    let state=send(fixture,newStorySession(fixture),{type:'enter',levelId:'fixture-one'});
    state=send(fixture,state,{type:'next'});
    expect(state.pending).toMatchObject({kind:'intro',line:1});
    state=send(fixture,state,{type:'next'});
    expect(state.pending).toMatchObject({kind:'node',line:0,nodeId:'entry'});
    state=send(fixture,state,{type:'next'});
    expect(state.pending?.line).toBe(1);
    expect(state.progress['fixture-one'].resolved).toEqual([]);
    state=travel(fixture,completeCurrent(fixture,closeDialogues(fixture,state)),'choice');
    state=send(fixture,state,{type:'choose',choiceId:'record'});
    expect(dialogueLines(fixture,state.pending).map(l=>l.text)).toEqual(['choice response B','choice resolved']);
    state=send(fixture,state,{type:'next'});
    expect(state.pending).toMatchObject({kind:'choice',line:1,choiceId:'record'});
    state=completeCurrent(fixture,travel(fixture,closeDialogues(fixture,state),'battle'));
    state=travel(fixture,state,'exit');
    state=send(fixture,state,{type:'complete'});
    expect(state.pending?.kind).toBe('after');
    state=send(fixture,state,{type:'next'});
    expect(state.pending).toMatchObject({kind:'outro',line:0});
    expect(unlockedLevels(fixture,state)).toEqual(['fixture-one']);
    state=send(fixture,state,{type:'next'});
    expect(state.pending).toMatchObject({kind:'outro',line:1});
    expect(state.progress['fixture-one'].completed).toBe(false);
    state=send(fixture,state,{type:'next'});
    expect(state.progress['fixture-one'].completed).toBe(true);
    expect(unlockedLevels(fixture,state)).toEqual(['fixture-one','fixture-two']);
  });
  it('blocks state-changing commands while dialogue is open and supports skipping only the current dialogue',()=>{
    const state=send(fixture,newStorySession(fixture),{type:'enter',levelId:'fixture-one'});
    for(const command of [{type:'enter',levelId:'fixture-one'},{type:'complete'},{type:'move',nodeId:'choice'},{type:'team',team:[]}] as StoryCommand[])expect(dispatchStory(fixture,state,command)).toBe(state);
    const skipped=send(fixture,state,{type:'skip'});
    expect(skipped.pending?.kind).toBe('node');
    expect(skipped.progress['fixture-one'].resolved).toEqual([]);
  });
  it('returns mid-dialogue to the atlas and resumes that exact line for every story phase',()=>{
    const levelId = fixtureLevel.id;
    function pauseAndResume(state: StorySession) {
      const atlas = send(fixture,state,{type:'atlas'});
      expect(atlas.view).toBe('atlas');
      expect(atlas.pending).toBeNull();
      expect(atlas.progress[levelId].pausedDialogue).toEqual(state.pending);
      expect(send(fixture,decodeStorySave(fixture,JSON.stringify(atlas)),{type:'enter',levelId})).toEqual(state);
    }
    let state=send(fixture,newStorySession(fixture),{type:'enter',levelId});
    pauseAndResume(send(fixture,state,{type:'next'}));
    state=send(fixture,state,{type:'skip'});
    pauseAndResume(send(fixture,state,{type:'next'}));
    state=send(fixture,toChoice(),{type:'choose',choiceId:'record'});
    pauseAndResume(send(fixture,state,{type:'next'}));
    state=travel(fixture,closeDialogues(fixture,state),'battle');
    state=send(fixture,state,{type:'battle-result',winner:'draw'});
    pauseAndResume(send(fixture,state,{type:'failure'}));
    state=travel(fixture,completeCurrent(fixture,state),'exit');
    state=send(fixture,state,{type:'complete'});
    pauseAndResume(state);
    state=send(fixture,state,{type:'skip'});
    pauseAndResume(send(fixture,state,{type:'next'}));
  });
  it('requires a valid choice, saves the response, and cannot silently replace it',()=>{
    let state=toChoice();
    expect(dispatchStory(fixture,state,{type:'complete'})).toBe(state);
    expect(dispatchStory(fixture,state,{type:'choose',choiceId:'wrong'})).toBe(state);
    state=send(fixture,state,{type:'choose',choiceId:'listen'});
    expect(dialogueLines(fixture,state.pending)[0].text).toBe('choice response A');
    expect(state.progress['fixture-one'].choices.choice).toBe('listen');
    state=closeDialogues(fixture,state);
    expect(dispatchStory(fixture,state,{type:'choose',choiceId:'record'})).toBe(state);
  });
  it('requires every mandatory objective before exit, but permits returning from a side branch',()=>{
    let state=completeCurrent(fixture,toChoice());
    expect(missingObjectives(fixtureLevel,state.progress['fixture-one'])).toEqual(['battle']);
    expect(dispatchStory(fixture,state,{type:'move',nodeId:'exit'})).toBe(state);
    state=completeCurrent(fixture,travel(fixture,state,'camp'));
    state=travel(fixture,state,'choice');
    expect(state.progress['fixture-one'].current).toBe('choice');
    expect(state.progress['fixture-one'].visited.filter(id=>id==='choice')).toHaveLength(1);
    state=completeCurrent(fixture,travel(fixture,state,'battle'));
    expect(missingObjectives(fixtureLevel,state.progress['fixture-one'])).toEqual([]);
    expect(canMove(fixtureLevel,state.progress['fixture-one'],'exit')).toBe(true);
  });
  it('guides the party one connected step toward a main objective or the open exit',()=>{
    const next=(s:StorySession)=>nextStoryStop(fixtureLevel,s.progress[fixtureLevel.id])?.id;
    let state=toChoice();
    expect(next(state)).toBeUndefined();
    state=completeCurrent(fixture,state);
    expect(next(state)).toBe('battle');
    state=completeCurrent(fixture,travel(fixture,state,'camp'));
    expect(next(state)).toBe('choice');
    state=completeCurrent(fixture,travel(fixture,state,'battle'));
    expect(next(state)).toBe('exit');
  });
  it.each(['enemy','draw','ally'] as const)('keeps %s at its battle node across atlas returns and reloads',winner=>{
    let state=travel(fixture,completeCurrent(fixture,toChoice()),'battle');
    const levelId=fixtureLevel.id;
    const before=state.progress[levelId].resolved;
    state=send(fixture,state,{type:'battle-result',winner});
    expect(dispatchStory(fixture,state,{type:'battle-result',winner})).toBe(state);
    state=send(fixture,state,{type:'atlas'});
    state=decodeStorySave(fixture,JSON.stringify(state));
    expect(state.progress[levelId]).toMatchObject({current:'battle',resolved:before,completed:false,lastBattle:{winner,needsDebrief:winner!=='ally'}});
    state=send(fixture,state,{type:'enter',levelId});
    if(winner!=='ally') {
      state=send(fixture,state,{type:'failure'});
      expect(state.pending?.kind).toBe('failure');
      state=closeDialogues(fixture,state);
    }
    expect(state.progress[levelId].lastBattle?.needsDebrief).toBe(false);
    expect(state.progress[levelId].resolved).toEqual(before);
    if (winner!=='ally') {
      state=send(fixture,state,{type:'battle-result',winner});
      expect(state.progress[levelId].lastBattle?.needsDebrief).toBe(true);
      state=closeDialogues(fixture,send(fixture,state,{type:'failure'}));
    }
    state=completeCurrent(fixture,state);
    state=send(fixture,state,{type:'battle-result',winner:'enemy'});
    expect(state.progress[levelId].lastBattle).toEqual({winner:'enemy',needsDebrief:false});
    expect(dispatchStory(fixture,state,{type:'failure'})).toBe(state);
    state=travel(fixture,state,'exit');
    expect(state.progress[levelId].lastBattle).toBeUndefined();
  });
  it('does not resolve or complete a battle after failure dialogue',()=>{
    let state=travel(fixture,completeCurrent(fixture,toChoice()),'battle');
    state=send(fixture,state,{type:'battle-result',winner:'enemy'});
    const before=structuredClone(state.progress['fixture-one'].resolved);
    state=send(fixture,state,{type:'failure'});
    expect(state.pending?.kind).toBe('failure');
    state=closeDialogues(fixture,state);
    expect(state.progress['fixture-one'].resolved).toEqual(before);
    expect(state.progress['fixture-one'].resolved).not.toContain('battle');
    expect(state.progress['fixture-one'].completed).toBe(false);
    state=completeCurrent(fixture,state);
    expect(state.progress['fixture-one'].resolved).toContain('battle');
  });
  it('validates formations and isolates the submitted team from the stored snapshot',()=>{
    const state=newStorySession(fixture),team=structuredClone(state.team);
    team[0].name='独立队伍';
    const changed=send(fixture,state,{type:'team',team});
    team[0].name='外部又改名';
    expect(changed.team[0].name).toBe('独立队伍');
    const duplicate=structuredClone(state.team);duplicate[1].slot=duplicate[0].slot;
    expect(()=>dispatchStory(fixture,state,{type:'team',team:duplicate})).toThrow('阵位');
    expect(()=>dispatchStory(fixture,state,{type:'team',team:[]})).toThrow();
    const invalid=structuredClone(state);invalid.team[0].rules[0].skill='heal';
    expect(()=>decodeStorySave(fixture,JSON.stringify(invalid))).toThrow('技能');
  });
  it('rejects corrupt saves and impossible pending dialogue stages',()=>{
    for(const raw of ['null','[]','bad json','{}'])expect(()=>decodeStorySave(fixture,raw)).toThrow();
    const entry=begin();
    const mutations:((s:StorySession)=>void)[]=[
      s=>{s.bookId='different-book';},s=>{s.progress['fixture-one'].current='unknown';},
      s=>{s.progress['fixture-one'].visited.push('battle');},
      s=>{s.progress['fixture-one'].completed=true;},
      s=>{s.pending={kind:'failure',levelId:'fixture-one',nodeId:'entry',line:0};},
      s=>{s.pending={kind:'intro',levelId:'fixture-one',line:0};},
      s=>{s.pending={kind:'outro',levelId:'fixture-one',line:0};},
      s=>{s.pending={kind:'node',levelId:'fixture-one',nodeId:'entry',line:200};},
      s=>{s.pending={kind:'node',levelId:'fixture-one',nodeId:'entry',line:-1};},
    ];
    for(const mutate of mutations){const copy=structuredClone(entry);mutate(copy);expect(()=>decodeStorySave(fixture,JSON.stringify(copy))).toThrow();}
    const choice=toChoice();choice.pending={kind:'after',levelId:'fixture-one',nodeId:'choice',line:0};
    expect(()=>decodeStorySave(fixture,JSON.stringify(choice))).toThrow();
  });
  it('rejects saves that discard an unfinished introduction, chosen response or ending',()=>{
    const intro=structuredClone(send(fixture,newStorySession(fixture),{type:'enter',levelId:'fixture-one'}));
    intro.pending=null;
    expect(()=>decodeStorySave(fixture,JSON.stringify(intro))).toThrow();
    let state=send(fixture,toChoice(),{type:'choose',choiceId:'listen'});
    const choice=structuredClone(state);choice.pending=null;
    expect(()=>decodeStorySave(fixture,JSON.stringify(choice))).toThrow();
    state=completeCurrent(fixture,travel(fixture,closeDialogues(fixture,state),'battle'));
    state=send(fixture,travel(fixture,state,'exit'),{type:'complete'});
    state=send(fixture,state,{type:'next'});
    expect(state.pending?.kind).toBe('outro');
    const ending=structuredClone(state);ending.pending=null;
    expect(()=>decodeStorySave(fixture,JSON.stringify(ending))).toThrow();
  });
});

describe('complete historical narrative content',()=>{
  let storyBook:StoryBook;
  let validateBook:(book:StoryBook)=>void;
  beforeAll(async()=>{({storyBook,validateBook}=await import('./book'));});
  it('contains six chapters and twenty connected levels ending before the first encirclement campaign',()=>{
    expect(()=>validateBook(storyBook)).not.toThrow();
    expect(storyBook.chapters).toHaveLength(6);
    expect(storyBook.levels).toHaveLength(20);
    expect(storyBook.levels.at(-1)?.period).toContain('1930');
    expect(storyBook.levels.at(-1)?.title).toContain('罗坊');
    expect(storyBook.sourceNotes.join('')).toContain('第一次');
    expect(storyBook.levels.every(level=>!level.period.includes('1931'))).toBe(true);
    for(const level of storyBook.levels){
      expect(level.nodes.length).toBeGreaterThanOrEqual(5);
      expect(level.intro.length).toBeGreaterThanOrEqual(3);
      expect(level.outro.length).toBeGreaterThanOrEqual(3);
      expect(level.nodes.some(n=>n.optional)).toBe(true);
      expect(level.sources.length).toBeGreaterThan(0);
      for(const value of Object.values(level.style))expect(value.trim().length).toBeGreaterThan(0);
    }
  });
  it('keeps every local source link resolvable and all referenced source ids present',async()=>{
    // Load the Node-only test helper without adding Node globals to the browser app's types.
    const {existsSync}=await vi.importActual<{existsSync:(path:URL)=>boolean}>('node:fs');
    const workspace=new URL('../../../',import.meta.url);
    expect(storyBook.sources.some(source=>source.type==='memoir'&&source.path)).toBe(true);
    expect(storyBook.sources.some(source=>source.type==='history'&&source.url)).toBe(true);
    for(const source of storyBook.sources){
      if(source.path)expect(existsSync(new URL(source.path,workspace)),`${source.id}: ${source.path}`).toBe(true);
      if(source.url)expect(source.url).toMatch(/^https:\/\//);
      expect(source.note.trim().length).toBeGreaterThan(0);
    }
  });
  it('plays all twenty levels through real commands, including every optional branch, with resumable dialogue snapshots',()=>{
    let state=newStorySession(storyBook);
    for(const [index,level] of storyBook.levels.entries()){
      expect(unlockedLevels(storyBook,state)).toContain(level.id);
      state=closeDialogues(storyBook,send(storyBook,state,{type:'enter',levelId:level.id}));
      for(const target of level.nodes.filter(n=>n.id!==level.exit)){
        state=travel(storyBook,state,target.id);
        state=completeCurrent(storyBook,state);
      }
      expect(missingObjectives(level,state.progress[level.id]),level.id).toEqual([]);
      state=completeCurrent(storyBook,travel(storyBook,state,level.exit));
      expect(state.progress[level.id].completed,level.id).toBe(true);
      expect(state.progress[level.id].resolved).toHaveLength(level.nodes.length);
      expect(Object.values(state.progress).filter(p=>p.completed)).toHaveLength(index+1);
      state=send(storyBook,state,{type:'atlas'});
    }
    expect(unlockedLevels(storyBook,state)).toHaveLength(20);
    expect(state.progress.s20.completed).toBe(true);
  });
});
