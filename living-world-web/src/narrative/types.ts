export interface DialogueLine { speaker: string; text: string; kind: 'narration' | 'dialogue' | 'history'; title?: string }
export interface StorySource { id: string; title: string; type: 'memoir' | 'history'; path?: string; url?: string; note: string }
export interface StoryCharacter { id: string; name: string; role: string; description: string; arc: string }
export interface StoryChoice { id: string; label: string; text: string; lines: DialogueLine[]; flag: string }
export interface StoryNode { id: string; name: string; kind: 'story' | 'battle' | 'camp' | 'choice' | 'exit'; x: number; y: number; summary: string; objective: string; dialogue: DialogueLine[]; after: DialogueLine[]; choices?: StoryChoice[]; optional?: boolean }
export interface StoryLevel {
  id: string; chapterId: string; title: string; period: string; location: string; world: {x: number; y: number};
  objective: string; background: string; historicalNotes: string[]; sources: string[];
  style: { palette: string; weather: string; lighting: string; sound: string; composition: string };
  map: { terrain: 'hills' | 'village' | 'mountain' | 'river' | 'town'; labels: {name: string; x: number; y: number}[]; routeNote: string };
  intro: DialogueLine[]; outro: DialogueLine[]; failure: DialogueLine[];
  entry: string; exit: string; nodes: StoryNode[]; edges: {from: string; to: string}[];
}
export interface StoryChapter { id: string; title: string; period: string; summary: string; theme: string; region: string; levels: string[] }
export interface StoryBook { id: string; title: string; subtitle: string; period: string; premise: string; sourceNotes: string[]; cast: StoryCharacter[]; sources: StorySource[]; chapters: StoryChapter[]; levels: StoryLevel[] }
