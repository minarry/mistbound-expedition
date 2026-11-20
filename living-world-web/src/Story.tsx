import { MapDiorama } from './three/MapDiorama';
import { useEffect, useState } from 'react';
export interface StoryLine { speaker: string; title: string; text: string }
export const introStory: StoryLine[] = [
 {speaker:'序章 · 雾历 317 年',title:'最后一盏灯',text:'北境的灯塔已经熄灭了七夜。商道隐入浓雾，再也没有一封信抵达晨星营地。'},
 {speaker:'艾拉 · 随行牧师',title:'雾里仍有人等待',text:'灰苇哨站还有生还者。我们得先穿过河谷，点亮哨站的引路灯，再去寻找暮钟隘口。'},
 {speaker:'莱恩 · 雾行小队',title:'从这里，重新出发',text:'把盾卫放到前排，弓手留在侧翼。沿地图上的旧道行军——这一次，我们带所有人回家。'},
];
export default function Story({lines,exitLabel,onClose}:{lines:StoryLine[];exitLabel:string;onClose:()=>void}) {
 const [index,setIndex]=useState(0),[letters,setLetters]=useState(0),[auto,setAuto]=useState(true);
 const line=lines[index];
 useEffect(()=>{setLetters(0);const timer=window.setInterval(()=>setLetters(n=>Math.min(n+1,line.text.length)),42);return()=>clearInterval(timer);},[line]);
 useEffect(()=>{if(!auto)return;const timer=window.setTimeout(()=>index<lines.length-1?setIndex(index+1):onClose(),9000);return()=>clearTimeout(timer);},[auto,index,lines.length,onClose]);
 return <div className="story-screen" role="dialog" aria-modal="true" aria-label="远征剧情"><div className={`story-landscape story-shot-${index}`}><div className="story-moon"/><div className="story-range far"/><div className="story-range near"/><div className="story-tower"><i/><i/><i/></div><div className="story-fog"/><div className="story-travellers">♜ <span>⚑</span> ♟</div><MapDiorama view="landscape" weather="dusk" terrain="mountain" seed="mistbound-intro"/></div><div className="story-top"><span>{lines===introStory?'远征序章':'行军纪事'}</span><button autoFocus onClick={onClose}>跳过剧情 →</button></div><div className="story-chapter" key={index}><h2>{line.title}</h2></div><div className="story-dialogue"><div className="story-speaker">{line.speaker}</div><p aria-label={line.text}>{line.text.slice(0,letters)}<span className="story-caret">▏</span></p><div className="story-bottom"><span>{index+1} / {lines.length} <i>✧</i></span><div><button aria-pressed={auto} onClick={()=>setAuto(!auto)}>{auto?'暂停自动播放':'自动播放'}</button><button className="landing-primary" onClick={()=>{if(letters<line.text.length)setLetters(line.text.length);else if(index<lines.length-1)setIndex(index+1);else onClose();}}>{index===lines.length-1?exitLabel:'下一幕'} →</button></div></div></div></div>;
}
