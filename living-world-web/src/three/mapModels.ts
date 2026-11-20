import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type Asset = 'tree' | 'house' | 'bridge' | 'rock' | 'watchtower' | 'hero-sword';
const assets = new Map<Asset, Promise<THREE.BufferGeometry>>();
export const assetMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .91, flatShading: true });

// Static scenery is baked into one colored geometry per GLB so each grove costs one draw.
export function assetGeometry(asset: Asset) {
  const cached = assets.get(asset);
  if (cached) return cached;
  const promise = new GLTFLoader().loadAsync(`/atelier/models/${asset}.glb`).then(({ scene }) => {
    scene.updateMatrixWorld(true);
    const parts: THREE.BufferGeometry[] = [];
    const originals = new Set<THREE.BufferGeometry | THREE.Material>();
    scene.traverse(item => {
      if (!(item instanceof THREE.Mesh)) return;
      const mesh = item as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]>;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach(mat => originals.add(mat));
      originals.add(mesh.geometry);
      const part = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      part.applyMatrix4(mesh.matrixWorld);
      if (!part.attributes.normal) part.computeVertexNormals();
      const count = part.attributes.position.count;
      const vertexColors = new Float32Array(count * 3);
      const colors = part.getAttribute('color');
      const groups = part.groups.length ? part.groups : [{ start: 0, count, materialIndex: 0 }];
      for (const group of groups) {
        const tint = materials[group.materialIndex ?? 0].color;
        for (let i = group.start; i < Math.min(count, group.start + group.count); i++) {
          vertexColors[i * 3] = tint.r * (colors?.getX(i) ?? 1);
          vertexColors[i * 3 + 1] = tint.g * (colors?.getY(i) ?? 1);
          vertexColors[i * 3 + 2] = tint.b * (colors?.getZ(i) ?? 1);
        }
      }
      for (const name of Object.keys(part.attributes)) if (name !== 'position' && name !== 'normal') part.deleteAttribute(name);
      part.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));
      parts.push(part);
    });
    const merged = mergeGeometries(parts);
    parts.forEach(part => part.dispose());
    originals.forEach(item => item.dispose());
    if (!merged) throw new Error(`Empty scenery asset ${asset}`);
    merged.computeBoundingBox();
    const bounds = merged.boundingBox!;
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    merged.translate(-center.x, -bounds.min.y, -center.z);
    const span = asset === 'bridge' ? Math.max(size.x, size.z) : size.y;
    if (asset === 'bridge' && size.z > size.x) merged.rotateY(Math.PI / 2);
    merged.scale(1 / span, 1 / span, 1 / span);
    return merged;
  }).catch(error => { assets.delete(asset); throw error; });
  assets.set(asset, promise);
  return promise;
}

