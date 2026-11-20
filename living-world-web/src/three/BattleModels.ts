import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Fighter } from '../core/battle';

const loader = new GLTFLoader();
const sources = new Map<string, Promise<THREE.Group>>();

export function loadBattleModel(id: string) {
  let source = sources.get(id);
  if (!source) {
    source = loader.loadAsync('/atelier/models/' + id + '.glb').then(({ scene }) => scene);
    sources.set(id, source);
    source.catch(() => sources.delete(id));
  }
  return source;
}

const ringGeometry = new THREE.RingGeometry(.45, .49, 48);
const shadowGeometry = new THREE.CircleGeometry(.47, 36);
const enemyTrim: Record<string, number> = {
  faction_cloth: 0xce6350, navy: 0x61484b, blue: 0x815953, blue_lite: 0x927065,
  moss: 0x645348, sage: 0x8d725c, teal: 0x865a52,
};

export class BattleActor {
  readonly root = new THREE.Group();
  readonly pivot = new THREE.Group();
  readonly body: THREE.Group;
  readonly leftArm?: THREE.Object3D;
  readonly rightArm?: THREE.Object3D;
  readonly foot = new THREE.Vector3();
  readonly size: THREE.Vector3;
  readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  readonly baseColor: number;
  private owned: THREE.Material[] = [];
  scale = 1;

  constructor(readonly side: Fighter['side'], source: THREE.Group) {
    this.baseColor = side === 'ally' ? 0xa1d5bd : 0xeea580;
    this.body = source.clone(true);
    const painted = new Map<THREE.Material, THREE.Material>();
    const tint = (material: THREE.Material) => {
      const color = side === 'enemy' ? enemyTrim[material.name] : material.name === 'faction_cloth' ? 0x4f9784 : undefined;
      if (color === undefined || !(material instanceof THREE.MeshStandardMaterial)) return material;
      const cached = painted.get(material);
      if (cached) return cached;
      const cloth = material.clone();
      cloth.color.setHex(color);
      painted.set(material, cloth);
      this.owned.push(cloth);
      return cloth;
    };
    this.body.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      node.material = Array.isArray(node.material) ? node.material.map(tint) : tint(node.material);
    });
    this.leftArm = this.body.getObjectByName('arm_l');
    this.rightArm = this.body.getObjectByName('arm_r');
    const bounds = new THREE.Box3().setFromObject(this.body);
    this.size = bounds.getSize(new THREE.Vector3());
    this.body.position.y -= bounds.min.y;
    this.body.position.x -= (bounds.max.x + bounds.min.x) / 2;
    this.pivot.add(this.body);
    const shadow = new THREE.MeshBasicMaterial({ color: 0x10261f, transparent: true, opacity: .45, depthWrite: false });
    const band = new THREE.MeshBasicMaterial({ color: this.baseColor, transparent: true, opacity: .65, depthWrite: false });
    this.owned.push(shadow, band);
    const disc = new THREE.Mesh(shadowGeometry, shadow);
    this.ring = new THREE.Mesh(ringGeometry, band);
    disc.rotation.x = this.ring.rotation.x = -Math.PI / 2;
    disc.position.y = .012;
    this.ring.position.y = .023;
    this.root.add(disc, this.ring, this.pivot);
  }

  dispose() {
    this.root.removeFromParent();
    for (const material of this.owned) material.dispose();
  }
}
