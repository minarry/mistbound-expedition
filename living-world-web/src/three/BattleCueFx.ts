import * as THREE from 'three';
import type { BattleEffect } from '../core/battle';
import type { BattleActor } from './BattleModels';

// Geometry is reused for every event. Poses are sampled directly at any t,
// including jumps to earlier events and fixed test frames.
export class BattleCueFx {
  readonly group = new THREE.Group();
  private readonly light = new THREE.MeshBasicMaterial({ color: 0xffdeb0, transparent: true, depthWrite: false });
  private readonly glint = new THREE.OctahedronGeometry(.12,0);
  private readonly arrow = new THREE.ConeGeometry(.085,.4,5);
  private readonly dome = new THREE.SphereGeometry(.83,12,8,0,Math.PI*2,0,Math.PI*.62);
  private readonly glass = new THREE.MeshBasicMaterial({ color: 0xbcecfc, wireframe: true, transparent: true, opacity: .45, depthWrite: false });
  private readonly shot = new THREE.Mesh(this.arrow,this.light);
  private readonly shield = new THREE.Mesh(this.dome,this.glass);
  private readonly sparkles = Array.from({length:9}, () => new THREE.Mesh(this.glint, this.light));
  private readonly start = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0,1,0);

  constructor() {
    this.group.add(this.shot, this.shield, ...this.sparkles);
  }

  sample(effect: BattleEffect | undefined, source: BattleActor | undefined, target: BattleActor | undefined, t: number, archer: boolean) {
    this.group.visible = !!effect && !!target && !!source;
    if (!effect || !target || !source) return;
    const healing = effect === 'heal' || effect === 'blessing';
    const cover = effect === 'cover';
    this.light.color.setHex(healing ? 0xcaffac : cover ? 0xcaeeff : 0xffda85);
    this.start.copy(source.foot);
    this.start.y += source.scale * source.size.y * .56;
    this.end.copy(target.foot);
    this.end.y += target.scale * target.size.y * .54;
    this.shot.visible = archer && !cover && !healing && t >= .28 && t <= .5;
    if (this.shot.visible) {
      const travel = THREE.MathUtils.clamp((t-.28)/.22,0,1);
      const arch = .6 * source.scale;
      this.shot.position.lerpVectors(this.start, this.end, travel);
      this.shot.position.y += 4*travel*(1-travel)*arch;
      this.tangent.subVectors(this.end,this.start);
      this.tangent.y += 4*(1-2*travel)*arch;
      this.shot.quaternion.setFromUnitVectors(this.up,this.tangent.normalize());
      this.shot.scale.setScalar(source.scale * 1.4);
    }
    const impact = THREE.MathUtils.clamp((t-.36)/.60,0,1);
    const visible = t >= .36 && t <= .96;
    this.shield.visible = cover && visible;
    if (this.shield.visible) {
      this.shield.position.copy(target.foot);
      this.shield.position.y += target.scale * .48;
      this.shield.scale.setScalar(target.scale * (1.03 + Math.sin(impact*Math.PI)*.3));
      this.glass.opacity = Math.sin(impact*Math.PI)*.62;
    }
    this.light.opacity = this.shot.visible ? 1 : Math.sin(impact * Math.PI);
    this.sparkles.forEach((sparkle,i) => {
      sparkle.visible = visible && !cover;
      if (!sparkle.visible) return;
      const angle = i / this.sparkles.length * Math.PI * 2;
      const scale = target.scale;
      if (healing) {
        sparkle.position.copy(target.foot);
        sparkle.position.x += Math.cos(angle + impact*2) * scale * .52;
        sparkle.position.z += Math.sin(angle + impact*2) * scale * .52;
        sparkle.position.y += ((impact + i*.12)%1 * 1.5 + .22) * scale;
        sparkle.scale.setScalar(scale * (.55+.5*Math.sin(impact*Math.PI)));
      } else {
        sparkle.position.copy(this.end);
        const radius = (.23 + .74*impact) * scale * (effect==='heavy'? 1.25 : 1);
        sparkle.position.x += Math.cos(angle)*radius;
        sparkle.position.y += Math.sin(angle)*radius;
        sparkle.position.z += scale*.22;
        sparkle.rotation.z = angle-Math.PI/2;
        sparkle.scale.set(.38*scale,(.9+.4*Math.sin(impact*Math.PI))*scale,.45*scale);
      }
    });
  }

  dispose() {
    for (const resource of [this.arrow,this.glint,this.dome,this.light,this.glass]) resource.dispose();
  }
}
