import * as THREE from 'three';
import { BattleActor, loadBattleModel } from './BattleModels';
import { BattleLandscape } from './BattleLandscape';
import { BattleCueFx } from './BattleCueFx';
import type { BattleCanvasProps } from './BattleCanvas';

const tilt = Math.PI / 6;
const viewHeight = 12;
const sinTilt = Math.sin(tilt), cosTilt = Math.cos(tilt);
const clamp = THREE.MathUtils.clamp;
const smooth = (p: number, start: number, end: number) => THREE.MathUtils.smoothstep(p, start, end);
const pulse = (p: number, a: number, b: number, c: number) => smooth(p,a,b) * (1 - smooth(p,b,c));

export class BattleTheatre {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-6,6,6,-6,.1,150);
  private readonly landscape?: BattleLandscape;
  private readonly effects = new BattleCueFx();
  private readonly resizeObserver: ResizeObserver;
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly actors = new Map<string, BattleActor>();
  private roster = '';
  private generation = 0;
  private pendingDraw = 0;
  private clock?: Animation;
  private dead = false;
  private loading = true;
  private contextLost = false;
  private viewport = new THREE.Vector2();
  private direction = new THREE.Vector3();

  constructor(private readonly canvas: HTMLCanvasElement, context: WebGL2RenderingContext, private props: BattleCanvasProps) {
    this.renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true });
    this.renderer.setClearColor(0x344939, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.camera.position.set(0, 40 * sinTilt, 40 * cosTilt);
    this.camera.lookAt(0,0,0);
    this.scene.add(new THREE.HemisphereLight(0xfff1cf, 0x637f75, 1.8));
    const sun = new THREE.DirectionalLight(0xffe4b7, 2.25);
    sun.position.set(-5,9,6);
    const rim = new THREE.DirectionalLight(0xaedce9,.9);
    rim.position.set(6,4,-7);
    this.scene.add(sun,rim,this.effects.group);
    this.landscape = new BattleLandscape(this.queueDraw);
    this.scene.add(this.landscape.group);
    this.resizeObserver = new ResizeObserver(this.layout);
    this.resizeObserver.observe(canvas.parentElement!);
    this.reduced.addEventListener('change', this.layout);
    canvas.addEventListener('webglcontextlost', this.onLoss);
    canvas.addEventListener('webglcontextrestored', this.onRestore);
    this.update(props);
  }

  update(props: BattleCanvasProps) {
    this.props = props;
    const roster = JSON.stringify(props.units.map(u => [u.id, u.side, u.job]));
    if (roster !== this.roster) {
      this.roster = roster;
      void this.loadActors(++this.generation);
    } else {
      this.layout();
    }
  }

  private async loadActors(generation: number) {
    this.loading = true;
    this.canvas.dataset.battleModels = 'loading';
    const roster = this.props.units;
    try {
      const [sources] = await Promise.all([
        Promise.all(roster.map(u => loadBattleModel('hero-' + u.job))),
        this.landscape?.ready,
      ]);
      if (this.dead || generation !== this.generation) return;
      for (const actor of this.actors.values()) actor.dispose();
      this.actors.clear();
      roster.forEach((u, i) => {
        const actor = new BattleActor(u.side, sources[i]);
        this.actors.set(u.id, actor);
        this.scene.add(actor.root);
      });
      this.loading = false;
      this.layout();
    } catch {
      if (!this.dead && generation === this.generation) {
        this.canvas.dataset.battleRenderer = 'fallback';
        this.canvas.dataset.battleModels = 'unavailable';
      }
    }
  }

  private layout = () => {
    const parent = this.canvas.parentElement;
    if (!parent || this.dead || this.contextLost) return;
    const bounds = this.canvas.getBoundingClientRect();
    const width = bounds.width, height = bounds.height;
    if (!width || !height) return;
    const viewWidth = viewHeight * width / height;
    if (this.viewport.x !== width || this.viewport.y !== height) {
      this.viewport.set(width,height);
      this.renderer.setSize(width, height, false);
      this.camera.left = -viewWidth/2;
      this.camera.right = viewWidth/2;
      this.camera.updateProjectionMatrix();
      this.landscape?.resize(viewWidth, viewHeight / sinTilt);
    }
    for (const anchor of parent.querySelectorAll<HTMLElement>('[data-character-anchor]')) {
      const actor = this.actors.get(anchor.dataset.characterAnchor!);
      if (!actor) continue;
      const box = anchor.getBoundingClientRect();
      const x = box.left - bounds.left + box.width / 2;
      const y = box.bottom - bounds.top - 3;
      actor.foot.set((x/width-.5)*viewWidth, 0, (y/height-.5)*viewHeight/sinTilt);
      // Allow clearance for raised equipment. For narrow cells, fit the
      // silhouette to the cell width before fitting the figure's full height.
      const modelHeight = Math.min(box.height * .94, box.width * 1.42);
      actor.scale = modelHeight / height * viewHeight / (Math.max(actor.size.y,.1) * cosTilt);
      actor.root.position.copy(actor.foot);
      actor.root.scale.setScalar(actor.scale);
    }
    this.clock = parent.querySelector('.bs-trajectory')?.getAnimations()[0];
    this.queueDraw();
  };

  private queueDraw = () => {
    if (!this.pendingDraw && !this.dead && !this.contextLost) this.pendingDraw = requestAnimationFrame(this.draw);
  };

  private draw = () => {
    this.pendingDraw = 0;
    if (this.dead || this.loading || this.contextLost || !this.viewport.y) return;
    const { playing, frame, previousFrame, selected, poseFraction } = this.props;
    const action = frame?.action;
    const duration = this.props.duration || 1;
    const progress = poseFraction !== undefined ? clamp(poseFraction,0,1)
      : this.reduced.matches ? .65
      : this.clock ? clamp(Number(this.clock.currentTime ?? 0)/duration,0,1)
      : .65;
    const effect = action?.effect;
    const casting = effect === 'blessing' || effect === 'heal';
    const guarding = effect === 'cover';
    const windup = pulse(progress,.02,.26,.50);
    const swing = pulse(progress,.21,.43,.83);
    const recoil = pulse(progress,.37,.52,.95);
    const source = frame?.actor ? this.actors.get(frame.actor) : undefined;
    const target = frame?.target ? this.actors.get(frame.target) : undefined;
    for (const unit of this.props.units) {
      const actor = this.actors.get(unit.id);
      if (!actor) continue;
      const acting = !!action && actor === source;
      const affected = !!action && actor === target;
      const facing = unit.side === 'ally' ? 1 : -1;
      const yaw = (this.props.deployment ? .38 : .78) * facing;
      const ranged = unit.job === 'bow';
      const accent = guarding ? 0xbfe8ff : casting ? 0xd0ffa3 : 0xffdc88;
      actor.ring.material.color.setHex(acting || affected || unit.id === selected ? accent : actor.baseColor);
      actor.ring.material.opacity = unit.hp === 0 ? .24 : acting || affected ? 1 : .6;
      actor.ring.scale.setScalar(acting || affected || unit.id === selected ? 1.17 : 1);
      const pivot = actor.pivot;
      pivot.position.set(0,0,0);
      pivot.rotation.set(0,yaw,0,'YXZ');
      if (actor.leftArm) actor.leftArm.rotation.set(0,0,0);
      if (actor.rightArm) actor.rightArm.rotation.set(0,0,0);
      if (acting) {
        if (target && target !== actor) {
          this.direction.subVectors(target.foot, actor.foot).normalize();
          const turn = Math.atan2(this.direction.x, this.direction.z);
          const delta = Math.atan2(Math.sin(turn-yaw), Math.cos(turn-yaw));
          pivot.rotation.y += delta * pulse(progress,0,.30,.95);
          if (!casting && !ranged) pivot.position.addScaledVector(this.direction, (guarding ? .4 : .64) * swing);
        }
        pivot.rotation.x = casting ? -.12*windup : -.20*windup + .23*swing;
        pivot.position.y += .07 * swing;
        if (actor.rightArm) {
          actor.rightArm.rotation.x = casting ? -1.1*(windup+swing*.6) : ranged ? -.85*windup : -.95*windup - .52*swing;
          actor.rightArm.rotation.z = !casting && !ranged && !guarding ? .8*windup - .68*swing : .1*swing;
        }
        if (actor.leftArm) actor.leftArm.rotation.x = guarding ? -1.05*swing : ranged ? -.97*(windup+swing*.55) : -.15*swing;
      }
      if (affected && !casting && !guarding) {
        pivot.rotation.z -= facing * .26 * recoil;
        pivot.position.x -= facing * .28 * recoil;
      }
      if (unit.hp <= 0) {
        const wasStanding = previousFrame?.units.find(u=>u.id === unit.id)?.hp;
        const fall = affected && wasStanding ? smooth(progress,.41,.80) : 1;
        pivot.rotation.z -= facing * 1.34 * fall;
        pivot.position.y += .19 * fall;
      }
    }
    this.effects.sample(effect,source,target,progress, !!frame?.units.some(u=>u.id === frame.actor && u.job === 'bow'));
    this.renderer.render(this.scene, this.camera);
    this.canvas.dataset.battleRenderer = 'ready';
    this.canvas.dataset.battleModels = 'ready';
    this.canvas.dataset.poseFraction = progress.toFixed(3);
    if (action && playing && poseFraction === undefined && !this.reduced.matches && this.clock && progress < 1) this.queueDraw();
  };

  private onLoss = (e: Event) => {
    e.preventDefault();
    this.contextLost = true;
    this.canvas.dataset.battleRenderer = 'fallback';
    cancelAnimationFrame(this.pendingDraw);
    this.pendingDraw = 0;
  };
  private onRestore = () => {
    this.contextLost = false;
    this.viewport.set(0,0);
    this.layout();
  };

  dispose() {
    this.dead = true;
    cancelAnimationFrame(this.pendingDraw);
    this.resizeObserver.disconnect();
    this.reduced.removeEventListener('change',this.layout);
    this.canvas.removeEventListener('webglcontextlost',this.onLoss);
    this.canvas.removeEventListener('webglcontextrestored',this.onRestore);
    this.landscape?.dispose();
    this.effects.dispose();
    for (const actor of this.actors.values()) actor.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
