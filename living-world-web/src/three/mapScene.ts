import * as THREE from 'three';
import { assetGeometry, assetMaterial, type Asset } from './mapModels';
import { sceneryStyle, skies } from './mapScenery';
import type { MapDioramaProps, MapPoint, MapRoad } from './MapDiorama';

type Config = Required<Pick<MapDioramaProps, 'terrain' | 'view' | 'coastal' | 'weather' | 'seed' | 'setting' | 'nodes' | 'roads'>>;
export interface MapInstance { setMarkers(current?: string, selected?: string, travelTo?: string, travelDuration?: number): void; dispose(): void }

interface XZ { x: number; z: number }
type PlacedAsset = XZ & { scale: number; angle: number };
const mapPoint = (p: MapPoint): XZ => ({ x: (p.x - 50) * .28, z: (p.y - 50) * .22 });
const distance = (a: XZ, b: XZ) => Math.hypot(a.x - b.x, a.z - b.z);
function segmentDistance(p: XZ, a: XZ, b: XZ) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const along = THREE.MathUtils.clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(p.x - a.x - along * dx, p.z - a.z - along * dz);
}
function generator(seed: string) {
  let n = 2166136261;
  for (const character of seed) n = Math.imul(n ^ character.charCodeAt(0), 16777619);
  return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
}
const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });

export function createMapScene(host: HTMLElement, config: Config, status: (value: 'ready' | 'fallback') => void): MapInstance {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  const scenic = config.view === 'landscape';
  const { terrain } = config;
  const style = sceneryStyle(terrain);
  const scene = new THREE.Scene();
  const weather = skies[config.weather];
  const sky = scenic ? weather.horizon : '#b4c0a6';
  scene.background = new THREE.Color(sky);
  let backdrop: THREE.CanvasTexture | undefined;
  if (scenic) {
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 8; skyCanvas.height = 256;
    const brush = skyCanvas.getContext('2d')!;
    const gradient = brush.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, weather.zenith);
    gradient.addColorStop(.36, sky);
    gradient.addColorStop(.67, weather.horizon);
    gradient.addColorStop(1, '#a7b9a5');
    brush.fillStyle = gradient; brush.fillRect(0, 0, 8, 256);
    backdrop = new THREE.CanvasTexture(skyCanvas);
    backdrop.colorSpace = THREE.SRGBColorSpace;
    scene.background = backdrop;
    scene.fog = new THREE.FogExp2(weather.haze, weather.fog);
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  host.append(renderer.domElement);
  const elevation = 57 * Math.PI / 180;
  const plan = new THREE.OrthographicCamera(-14, 14, 11 * Math.sin(elevation), -11 * Math.sin(elevation), .1, 100);
  plan.position.set(0, 38 * Math.sin(elevation), 38 * Math.cos(elevation));
  plan.lookAt(0, 0, 0);
  const lens = new THREE.PerspectiveCamera(39, 1, .2, 160);
  lens.position.set(12, 8.2, 16);
  lens.lookAt(-.8, 2.75, -3.4);
  const camera = scenic ? lens : plan;
  const sun = new THREE.DirectionalLight(weather.sun, weather.direct);
  sun.position.set(-13, 20, -9);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, far: 75 });
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.normalBias = .035;
  sun.shadow.bias = -.00045;
  scene.add(sun, new THREE.HemisphereLight(weather.sky, '#798675', weather.ambient));

  const rng = generator(config.seed);
  const phase = rng() * Math.PI * 2;
  const anchors = new Map(config.nodes.map(p => [p.id, mapPoint(p)]));
  const routes = config.roads.flatMap((road: MapRoad) => {
    const a = anchors.get(road.from), b = anchors.get(road.to);
    return a && b ? [{ a, b }] : [];
  });
  const locations = Array.from(anchors.values());
  const nearRoad = (p: XZ) => {
    let nearest = 20;
    for (const { a, b } of routes) nearest = Math.min(nearest, segmentDistance(p, a, b));
    for (const node of locations) nearest = Math.min(nearest, distance(p, node));
    return nearest;
  };
  const meander = (z: number) => 1.45 * Math.sin(z * .3 + phase) + .72 * Math.cos(z * .56 - phase);
  const bridgeNode = anchors.get('bridge');
  const channel = bridgeNode ? bridgeNode.x - meander(bridgeNode.z) : -2.7;
  const riverX = (z: number) => channel + meander(z);
  const halfRiver = style.riverWidth;
  const mountain = terrain === 'mountain';
  const riverDistance = (x: number, z: number) => Math.abs(x - riverX(z));
  const shore = (z: number) => -11.6 + .67 * Math.sin(z * .54) + .26 * Math.cos(z * .83);
  const distanceToBank = (x: number, z: number) => Math.min(riverDistance(x, z) - halfRiver, config.coastal ? x - shore(z) : Infinity);
  function height(x: number, z: number) {
    const bank = distanceToBank(x, z);
    if (bank < 0) return -.23;
    const crest = .54 + .20 * Math.sin(x * .53 + z * .31 + phase) + .16 * Math.cos(x * .27 - z * .69);
    const rim = Math.pow(Math.max(0, (Math.abs(x) - 6) / 8, (-z - 3) / 8), 1.4);
    const hills = Math.exp(-(((x + 9) / 4.3) ** 2 + ((z + 6) / 2.3) ** 2))
      + .85 * Math.exp(-(((x - 8.2) / 3.4) ** 2 + ((z + 8) / 2.6) ** 2));
    const relief = .055 + hills * style.relief + crest * (.15 + Math.min(2, rim) * (mountain ? 2.1 : 1.05));
    return THREE.MathUtils.smoothstep(bank, -.15, 1.2) * relief * THREE.MathUtils.smoothstep(nearRoad({ x, z }), .25, 2.2);
  }
  const ownedGeometry = new Set<THREE.BufferGeometry>();
  const ownedMaterials = new Set<THREE.Material>();
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, cast = false) {
    ownedGeometry.add(geometry);
    ownedMaterials.add(material);
    const result = new THREE.Mesh(geometry, material);
    result.receiveShadow = true;
    result.castShadow = cast;
    scene.add(result);
    return result;
  }

  // Terrain facets use a separate variation per face like hand-cut model board.
  const ground = new THREE.PlaneGeometry(scenic ? 102 : 32, scenic ? 102 : 28, scenic ? 110 : 72, scenic ? 110 : 62);
  ground.rotateX(-Math.PI / 2);
  const position = ground.getAttribute('position');
  for (let i = 0; i < position.count; i++) position.setY(i, height(position.getX(i), position.getZ(i)));
  const facets = ground.toNonIndexed();
  ground.dispose();
  const verts = facets.getAttribute('position');
  const faceColors = new Float32Array(verts.count * 3);
  const grass = new THREE.Color(style.grass);
  const ridge = new THREE.Color(style.ridge);
  const sand = new THREE.Color(style.bank);
  const tint = new THREE.Color();
  for (let i = 0; i < verts.count; i += 3) {
    const x = verts.getX(i), z = verts.getZ(i);
    tint.copy(grass).lerp(ridge, Math.min(.88, Math.max(0, verts.getY(i)) / 2.4))
      .lerp(sand, 1 - THREE.MathUtils.smoothstep(distanceToBank(x, z), .12, .8))
      .multiplyScalar(.95 + .065 * rng() + .035 * Math.sin(x * .6 + z * .4));
    for (let j = i; j < i + 3; j++) tint.toArray(faceColors, j * 3);
  }
  facets.setAttribute('color', new THREE.BufferAttribute(faceColors, 3));
  facets.computeVertexNormals();
  mesh(facets, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));

  function ribbon(points: THREE.Vector3[], width: number, material: THREE.Material) {
    const vertices: number[] = [], indices: number[] = [];
    points.forEach((p, i) => {
      const next = points[Math.min(i + 1, points.length - 1)], prev = points[Math.max(0, i - 1)];
      const tangent = next.clone().sub(prev);
      const length = Math.hypot(tangent.x, tangent.z) || 1;
      const dx = -tangent.z / length * width / 2, dz = tangent.x / length * width / 2;
      vertices.push(p.x + dx, p.y, p.z + dz, p.x - dx, p.y, p.z - dz);
      if (i > 0) { const k = 2 * i; indices.push(k - 2, k, k - 1, k - 1, k, k + 1); }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices); geo.computeVertexNormals();
    material.side = THREE.DoubleSide;
    return mesh(geo, material);
  }
  const waterPoints = Array.from({ length: 181 }, (_, i) => {
    const z = (i - 90) * .45;
    return new THREE.Vector3(riverX(z), .012, z);
  });
  ribbon(waterPoints, halfRiver * 2.35, new THREE.MeshStandardMaterial({ color: '#619d99', roughness: .47, metalness: .1 }));
  if (config.coastal) {
    const water = new THREE.BufferGeometry();
    const positions: number[] = [], faces: number[] = [];
    for (let i = 0; i <= 100; i++) {
      const z = -18 + i * .36;
      positions.push(-21, .012, z, shore(z), .012, z);
      if (i) { const k = i * 2; faces.push(k-2,k,k-1,k-1,k,k+1); }
    }
    water.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    water.setIndex(faces); water.computeVertexNormals();
    mesh(water, mat('#659491'));
  }
  const ripples = new THREE.MeshBasicMaterial({ color: '#b1cbb5' });
  for (let i = 0; i < 32; i++) {
    const z = (rng() - .5) * 31, offset = (rng() - .5) * halfRiver * 1.7;
    const points = [-.21, -.08, .09, .21].map(t => new THREE.Vector3(riverX(z + t) + offset + .025 * Math.sin(t * 16), .023, z + t));
    ribbon(points, .017, ripples);
    if (config.coastal && i % 2 === 0) {
      const offset = .22 + (i % 5) * .23;
      ribbon([-.37,-.12,.14,.37].map(t => new THREE.Vector3(shore(z + t) - offset - .05 * Math.cos(t * 6), .025, z + t)), .021, ripples);
    }
  }
  const placements = new Map<Asset, PlacedAsset[]>();
  function place(asset: Asset, x: number, z: number, scale: number, angle = 0) {
    const list = placements.get(asset) || [];
    list.push({ x, z, scale, angle }); placements.set(asset, list);
  }
  if (bridgeNode) {
    const approach = anchors.get('approach');
    const angle = approach ? -Math.atan2(approach.z - bridgeNode.z, approach.x - bridgeNode.x) : 0;
    place('bridge', bridgeNode.x, bridgeNode.z, halfRiver * 3.5, angle);
  }
  const roadMat = mat('#d3bc8e');
  for (const { a, b } of routes) {
    const path = Array.from({ length: 31 }, (_, i) => {
      const x = THREE.MathUtils.lerp(a.x, b.x, i / 30), z = THREE.MathUtils.lerp(a.z, b.z, i / 30);
      return new THREE.Vector3(x, Math.max(.042, height(x, z) + .045), z);
    });
    ribbon(path, .23, roadMat);
    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1], p = path[i];
      if ((prev.x - riverX(prev.z)) * (p.x - riverX(p.z)) < 0 && (!bridgeNode || distance(bridgeNode, p) > 2)) {
        const angle = -Math.atan2(b.z - a.z, b.x - a.x);
        const crossing = Math.max(.6, Math.abs(Math.cos(angle)));
        place('bridge', (prev.x + p.x) / 2, (prev.z + p.z) / 2, 2.9 * halfRiver / crossing, angle);
      }
    }
  }
  if (!routes.length) {
    const bridge = { x: riverX(.5), z: .5 };
    place('bridge', bridge.x, bridge.z, halfRiver * 3.85);
    const track: THREE.Vector3[] = [];
    for (let i = 0; i < 80; i++) {
      const x = -19 + i * .48, z = .5 + 2.3 * Math.sin((x - bridge.x) * .22);
      track.push(new THREE.Vector3(x, Math.max(.036, height(x, z) + .06), z));
    }
    ribbon(track, .45, roadMat);
  }
  const settlements: XZ[] = [];
  function house(x: number, z: number, scale: number, angle: number) {
    if (distanceToBank(x, z) < .85 || nearRoad({ x, z }) < 1) return;
    settlements.push({ x, z }); place('house', x, z, scale, angle);
  }
  if (scenic) {
    [[1, .2], [3.6, -.5], [1.5, -2.3], [3.7, -3.8], [-6.5, -3.2], [-7.3, -5]].forEach(([x, z]) => house(x, z, 1.55 + rng() * .45, -.3 + rng() * .75));
    if (config.setting === 'frontier') {
      place('watchtower', -1, -5.4, 4.6, -.3);
      place('hero-sword', 3, 2.8, .95, 1.1);
    } else {
      const extras = terrain === 'town' ? 12 : terrain === 'village' ? 6 : 2;
      for (let i = 0; i < extras; i++) house(-9 + (i % 4) * 2.2, -7 - Math.floor(i / 4) * 2.1, 1.45, .22);
    }
  } else {
    for (let i = 0; i < style.houses; i++) {
      const cluster = [[5, -4], [-7, 5], [8, 4]][i % 3];
      const x = cluster[0] + (rng() - .5) * 5, z = cluster[1] + (rng() - .5) * 3.5;
      if (!settlements.some(p => distance({ x, z }, p) < 1.2)) house(x, z, .88 + rng() * .36, rng() * .8);
    }
    const tower = Array.from(anchors.values()).at(-1);
    if (tower && config.setting === 'frontier') place('watchtower', tower.x + .85, tower.z - .65, 1.5, -.3);
  }

  const fieldMats = ['#b89957', '#c5ae69', '#9b9d62', '#c8b37a'].map(mat);
  const furrow = mat('#8e875d');
  const fieldCenters = scenic ? [[5.5, 3.6], [6.2, 1.1], [-7.8, 2.6], [-9.4, 1.5]] : [[6.4, 7.5], [8.5, 6.2], [-9.3, 3.1], [5.5, -6.7]];
  fieldCenters.forEach(([x, z], i) => {
    if (distanceToBank(x, z) < 1.5 || nearRoad({ x, z }) < 1.6) return;
    const strip = mesh(new THREE.BoxGeometry(2.3, .075, 1.25), fieldMats[i]);
    strip.position.set(x, height(x, z) + .09, z); strip.rotation.y = -.27;
    for (let k = 0; k < 5; k++) {
      const ridge = mesh(new THREE.BoxGeometry(2.25, .035, .039), furrow);
      const offset = (k - 2) * .23;
      ridge.position.set(x + Math.sin(-.27) * offset, strip.position.y + .048, z + Math.cos(-.27) * offset);
      ridge.rotation.y = -.27;
    }
  });
  for (let i = 0; i < (scenic ? 580 : style.trees); i++) {
    const x = (rng() - .5) * (scenic ? 48 : 29), z = (rng() - .5) * (scenic ? 43 : 23);
    if (distanceToBank(x, z) < .45 || nearRoad({ x, z }) < 1.0) continue;
    if (settlements.some(p => distance({ x, z }, p) < 1.5) || fieldCenters.some(([fx, fz]) => Math.abs(x - fx) < 1.6 && Math.abs(z - fz) < 1.1)) continue;
    if (scenic && x > -1 && x < 11 && z > -6 && z < 13) continue;
    if (Math.sin(x * .71 + phase) + Math.cos(z * .84 - x * .22) < .15) continue;
    if (i % 11 === 0) place('rock', x, z, .27 + rng() * .42, rng() * 6);
    else place('tree', x, z, (scenic ? 1.9 : 1.12) * (.65 + .7 * rng()), rng() * 6.28);
  }
  if (scenic) {
    const disk = mesh(new THREE.CircleGeometry(3.8, 48), new THREE.MeshBasicMaterial({ color: '#ffe6ac', fog: false }));
    disk.visible = config.weather === 'clear';
    disk.position.set(-34, 13, -68); disk.quaternion.copy(lens.quaternion);
    // Irregular ridges soften into the distance behind the miniature.
    for (let layer = 0; layer < 3; layer++) {
      const profile: number[] = [], triangles: number[] = [];
      const z = -49 + layer * 9;
      for (let i = 0; i < 39; i++) {
        const x = (i - 19) * 3.2;
        const peak = 6.2 + 2.9 * Math.sin(i * .73 + phase + layer) + 1.7 * Math.cos(i * 1.17) + rng() * 2;
        profile.push(x, -.6, z + 4, x, peak * .5, z + 2 + rng(), x, peak, z - rng() * 3);
        if (i === 0) continue;
        const k = i * 3;
        triangles.push(k-3,k,k-2,k-2,k,k+1,k-2,k+1,k-1,k-1,k+1,k+2);
      }
      const ridge = new THREE.BufferGeometry();
      ridge.setAttribute('position', new THREE.Float32BufferAttribute(profile, 3));
      ridge.setIndex(triangles); ridge.computeVertexNormals();
      const paint = mat(['#a0afa6','#859d94','#708e84'][layer]);
      paint.side = THREE.DoubleSide;
      mesh(ridge, paint);
    }
  }

  const makeRing = (inner: number, outer: number, color: string) => {
    const item = mesh(new THREE.RingGeometry(inner, outer, 48), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    item.rotation.x = -Math.PI / 2; item.visible = false; return item;
  };
  const currentRing = makeRing(.52, .64, '#edce8c');
  const selectRing = makeRing(.71, .755, '#f8f0c5');
  const party = new THREE.Group();
  const hasParty = !scenic && config.setting === 'frontier' && locations.length > 0;
  party.visible = false; scene.add(party);
  let journey: { from: XZ; to: XZ; start: number; duration: number } | undefined;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let alive = true, lost = false, frame = 0, modelsReady = false;
  const draw = () => {
    if (!alive || lost || frame || !modelsReady) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!alive || lost) return;
      if (journey && party.visible) {
        const t = THREE.MathUtils.clamp((performance.now() - journey.start) / journey.duration, 0, 1);
        const smooth = t * t * (3 - 2 * t);
        const {from, to} = journey;
        const x = THREE.MathUtils.lerp(from.x, to.x, smooth), z = THREE.MathUtils.lerp(from.z, to.z, smooth);
        party.position.set(x, Math.max(.06, height(x, z)) + Math.abs(Math.sin(t * 11 * Math.PI)) * .08, z);
        if (t === 1) journey = undefined;
      }
      try {
        renderer.render(scene, camera);
        status('ready');
        if (journey) draw();
      } catch { lost = true; status('fallback'); }
    });
  };
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    lens.aspect = width / height;
    lens.fov = lens.aspect < .9 ? 48 : 39;
    lens.updateProjectionMatrix();
    draw();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const onLost = (event: Event) => { event.preventDefault(); lost = true; status('fallback'); };
  const onRestore = () => { lost = false; draw(); };
  renderer.domElement.addEventListener('webglcontextlost', onLost);
  renderer.domElement.addEventListener('webglcontextrestored', onRestore);
  const instances: THREE.InstancedMesh[] = [];
  const builds = Array.from(placements, async ([asset, list]) => {
    const geometry = await assetGeometry(asset);
    if (!alive) return;
    const group = new THREE.InstancedMesh(geometry, assetMaterial, list.length);
    group.castShadow = true; group.receiveShadow = true;
    const transform = new THREE.Object3D();
    list.forEach(({ x, z, scale, angle }, index) => {
      transform.position.set(x, asset === 'bridge' ? .036 : height(x, z), z);
      transform.rotation.y = angle; transform.scale.setScalar(scale); transform.updateMatrix();
      group.setMatrixAt(index, transform.matrix);
    });
    scene.add(group); instances.push(group);
  });
  if (hasParty) builds.push(assetGeometry('hero-sword').then(geometry => {
    if (!alive) return;
    const figure = new THREE.Mesh(geometry, assetMaterial);
    figure.scale.setScalar(1.58); figure.castShadow = true; figure.receiveShadow = true;
    party.add(figure);
  }));
  Promise.allSettled(builds).then(results => {
    if (!alive) return;
    modelsReady = results.every(result => result.status === 'fulfilled');
    host.dataset.assetState = modelsReady ? 'ready' : 'partial';
    if (modelsReady) draw();
    else status('fallback');
  });
  return {
    setMarkers(current, selected, travelTo, travelDuration = 1650) {
      const here = current && anchors.get(current);
      const destination = travelTo && anchors.get(travelTo);
      party.visible = hasParty && !!here;
      if (here && party.visible) {
        if (destination && !reducedMotion && travelDuration > 0) {
          if (journey?.to !== destination) {
            journey = { from: here, to: destination, start: performance.now(), duration: travelDuration };
            party.rotation.y = Math.atan2(destination.x - here.x, destination.z - here.z);
          }
        } else {
          journey = undefined;
          const p = destination || here;
          party.position.set(p.x, Math.max(.06, height(p.x, p.z)), p.z);
        }
      } else journey = undefined;
      for (const [ring, id] of [[currentRing, current], [selectRing, selected]] as const) {
        const point = id && anchors.get(id);
        ring.visible = !!point;
        if (point) ring.position.set(point.x, .07, point.z);
      }
      draw();
    },
    dispose() {
      alive = false; cancelAnimationFrame(frame); observer.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onRestore);
      for (const item of instances) item.dispose();
      for (const geo of ownedGeometry) geo.dispose();
      for (const material of ownedMaterials) material.dispose();
      backdrop?.dispose();
      sun.shadow.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
      delete host.dataset.assetState;
    },
  };
}
