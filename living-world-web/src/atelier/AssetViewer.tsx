import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export interface Asset {
  id: string; label: string; category: string; model: string; blockout: string;
  triangles: number; materials: string[]; size: number[];
}
export type CameraView = 'quarter' | 'front' | 'side' | 'top';
export type Stage = 'compare' | 'final' | 'blockout';
const directions: Record<CameraView, [number,number,number]> = {
  quarter: [3, 2, 4], front: [0, 0.05, 5], side: [5, 0.05, 0], top: [0, 5, 0.001],
};

function disposeTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh || node instanceof THREE.LineSegments)) return;
    geometries.add(node.geometry);
    for (const m of ([] as THREE.Material[]).concat(node.material)) materials.add(m);
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
}

export function AssetViewer({asset, cameraView, stage, wire, reset, savedOrbit, onOrbit}: {
  asset: Asset; cameraView: CameraView; stage: Stage; wire: boolean; reset: number;
  savedOrbit: string | null; onOrbit: (view: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading'|'ready'|'error'>('loading');
  useEffect(() => {
    const el = host.current!;
    let dead = false;
    setStatus('loading');
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false, preserveDrawingBuffer:true }); }
    catch { setStatus('error'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setScissorTest(true);
    el.prepend(renderer.domElement);
    const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .01, 1000);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enablePan = false;
    orbit.minZoom = .5;
    orbit.maxZoom = 5;
    const paths = stage === 'compare' ? [asset.blockout, asset.model] : [stage === 'blockout' ? asset.blockout : asset.model];
    const scenes = paths.map(() => {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#172622');
      scene.add(new THREE.HemisphereLight(0xffefd5, 0x719a91, 2.0));
      const key = new THREE.DirectionalLight(0xffe7bc, 2.2);
      key.position.set(-3, 6, 4);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xb0e2ef, 1.5);
      rim.position.set(3, 2, -3);
      scene.add(rim);
      return scene;
    });
    let radius = Math.max(...asset.size, 1);
    const draw = () => {
      if (dead) return;
      onOrbit([orbit.getAzimuthalAngle(),orbit.getPolarAngle(),camera.zoom].map(n=>n.toFixed(6)).join(','));
      const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
      renderer.setSize(w,h,false);
      const panelWidth = w / scenes.length;
      const aspect = panelWidth / h;
      const extent = radius * 1.18 / Math.min(1, aspect);
      camera.left = -extent * aspect; camera.right = extent * aspect;
      camera.top = extent; camera.bottom = -extent;
      camera.updateProjectionMatrix();
      scenes.forEach((scene,i) => {
        const x = Math.round(i*panelWidth), width = Math.round((i+1)*panelWidth)-x;
        renderer.setViewport(x,0,width,h); renderer.setScissor(x,0,width,h);
        renderer.render(scene,camera);
      });
    };
    const observer = new ResizeObserver(draw);
    observer.observe(el);
    orbit.addEventListener('change',draw);
    async function loadModels() {
      const loader = new GLTFLoader();
      const boxes = await Promise.all(paths.map(async (path,i) => {
        const {scene:model} = await loader.loadAsync(path);
        if (dead) { disposeTree(model); return new THREE.Box3(); }
        model.traverse(node => {
          if (node instanceof THREE.Mesh) for (const m of ([] as THREE.Material[]).concat(node.material)) {
            if (m instanceof THREE.MeshStandardMaterial) m.wireframe = wire;
          }
        });
        scenes[i].add(model);
        return new THREE.Box3().setFromObject(model);
      }));
      if (dead) return;
      const bounds = boxes.reduce((a,b) => a.union(b),new THREE.Box3());
      const center = bounds.getCenter(new THREE.Vector3());
      radius = Math.max(.1,bounds.getBoundingSphere(new THREE.Sphere()).radius);
      for (const scene of scenes) {
        const grid = new THREE.GridHelper(radius*4,16,0x51665a,0x344940);
        grid.position.set(center.x,bounds.min.y-.008,center.z);
        scene.add(grid);
      }
      orbit.target.copy(center);
      camera.position.fromArray(directions[cameraView]).normalize().multiplyScalar(radius*5).add(center);
      const custom = savedOrbit?.split(',').map(Number);
      if (custom?.length===3 && custom.every(Number.isFinite)) {
        const [azimuth,polar,zoom] = custom;
        camera.position.setFromSphericalCoords(radius*5, THREE.MathUtils.clamp(polar,.00001,Math.PI-.00001), azimuth).add(center);
        camera.zoom = THREE.MathUtils.clamp(zoom,orbit.minZoom,orbit.maxZoom);
      }
      orbit.update();
      draw();
      setStatus('ready');
    }
    loadModels().catch(() => { if (!dead) setStatus('error'); });
    function onLost(e: Event) { e.preventDefault(); if (!dead) setStatus('error'); }
    renderer.domElement.addEventListener('webglcontextlost',onLost);
    return () => {
      dead = true;
      observer.disconnect();
      orbit.dispose();
      renderer.domElement.removeEventListener('webglcontextlost',onLost);
      scenes.forEach(disposeTree);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  },[asset,cameraView,stage,wire,reset,savedOrbit,onOrbit]);
  return <div ref={host} className={'atelier-viewport '+(stage==='compare'?'is-pair':'')} data-ready={status} aria-label="三维模型视窗">
    <div className="atelier-badges"><span>{stage==='final'?'游戏模型':'体块灰模'}</span>{stage==='compare'&&<span>游戏模型</span>}</div>
    {status!=='ready'&&<p className="atelier-hint" role="status">{status==='loading'?'正在载入模型…':'模型未能显示。请检查 WebGL 和模型文件，或下载 GLB 查看。'}</p>}
  </div>;
}
