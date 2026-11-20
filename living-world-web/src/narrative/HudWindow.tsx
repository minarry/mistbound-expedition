import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  compact?: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function HudWindow({ title, compact = false, onClose, children }: Props) {
  const box = useRef<HTMLElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    box.current?.querySelector('button')?.focus();
    return () => { if (previous.current?.isConnected) previous.current.focus({preventScroll: true}); };
  }, []);
  return <div className={'sh-window-scrim'+(compact?' sh-compact':'')} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="sh-hud-window" role="dialog" aria-modal="true" aria-label={title} ref={box} onKeyDown={e=>{
      if(e.key==='Escape'){e.stopPropagation();onClose();return;}
      if(e.key!=='Tab')return;
      const controls=Array.from(box.current!.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], summary, select, [tabindex="0"]')).filter(el=>el.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();}
      if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}
    }}>
      <div className="sh-window-bar"><h2>{title}</h2><button className="sh-quiet" aria-label={'关闭'+title} onClick={onClose}>关闭 ×</button></div>
      <div className="sh-window-scroll">{children}</div>
    </section>
  </div>;
}
