import * as THREE from 'three';
import { loadBattleModel } from './BattleModels';

// An orthographic woodland clearing. Its coordinates follow the screen so the
// scenery stays at the edge at every aspect ratio, even around a full roster.
export class BattleLandscape {
  readonly group = new THREE.Group();
  readonly ready: Promise<unknown>;
  private readonly edge = new THREE.Group();
  private readonly owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  private disposed = false;
  private placements: { root: THREE.Object3D; x: number; z: number; size: number }[] = [];
  private width = 16;
  private depth = 16;

  constructor(draw: () => void) {
    const positions: number[] = [], colors: number[] = [];
    const cols = 29, rows = 23;
    const noise = (x: number, z: number) => {
      const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
      return n - Math.floor(n);
    };
    const vertex = (x: number, z: number) => [(x + (noise(x,z)-.5)*.55) / cols - .5, (z + (noise(z,x)-.5)*.55) / rows - .5];
    const meadow = new THREE.Color('#627658'), gravel = new THREE.Color('#9b8b71'), color = new THREE.Color();
    for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) {
      const a = vertex(x,z), b = vertex(x+1,z), c = vertex(x+1,z+1), d = vertex(x,z+1);
      const bend = Math.sin(z / rows * 5.5) * .095;
      const distance = Math.abs(x / cols - .5 - bend);
      const trail = 1 - THREE.MathUtils.smoothstep(distance, .035, .18);
      for (const tri of [[a,c,b],[a,d,c]]) {
        const light = .77 + Math.sin(x * .39 + z * .29) * .055 + noise(x*3 + tri[1][0],z)*.10;
        color.copy(meadow).lerp(gravel, trail).multiplyScalar(light);
        for (const p of tri) {
          positions.push(p[0]*1.14, -.045, p[1]*1.14);
          colors.push(color.r,color.g,color.b);
        }
      }
    }
    const ground = new THREE.BufferGeometry();
    ground.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    ground.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const groundMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.owned.push(ground, groundMaterial);
    this.group.add(new THREE.Mesh(ground, groundMaterial), this.edge);
    const props: Record<string, number[][]> = {
      tree: [[.014,.06,.098],[.073,.037,.087],[.13,.02,.062],[.35,.013,.065],[.62,.01,.06],[.957,.061,.109],[1.012,.27,.10],[-.018,.45,.10],[.02,.91,.081],[1.009,.9,.10]],
      rock: [[.09,.10,.017], [.28,.036,.019],[.61,.045,.011],[.89,.095,.018],[.06,.62,.016],[.02,.66,.012],[.95,.68,.027],[.45,.91,.014],[.91,.91,.016]],
    };
    this.ready = Promise.allSettled(Object.entries(props).map(([key,entries]) =>
      loadBattleModel(key).then(source => {
        if (this.disposed) return;
        const box = new THREE.Box3().setFromObject(source), size = box.getSize(new THREE.Vector3());
        for (const [x,z,height] of entries) {
          const root = source.clone(true);
          root.rotation.y = x*31+z*12;
          const factor = height / (size.y || 1);
          this.edge.add(root);
          this.placements.push({ root, x, z, size: factor });
        }
        this.resize(this.width, this.depth);
        draw();
      })
    ));
  }

  resize(width: number, depth: number) {
    this.width = width; this.depth = depth;
    this.group.children[0].scale.set(width, 1, depth);
    for (const {root, x, z, size} of this.placements) {
      root.position.set((x-.5)*width, 0, (z-.5)*depth);
      root.scale.setScalar(size * Math.min(depth, width * 1.65));
    }
  }

  dispose() {
    this.disposed = true;
    for (const item of this.owned) item.dispose();
  }
}
