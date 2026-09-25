import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/*
 * MESH MODEL - white_mesh.glb on a transparent stage.
 * Gentle idle spin + float; the group eases toward your cursor
 * (yaw / pitch parallax). No controls, no chrome - just the object.
 */
export default function MeshModel({ src = '/white-mesh.glb' }) {
  const mountRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0.35, 6.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.DirectionalLight(0xfff1de, 2.4);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rimCrimson = new THREE.DirectionalLight(0xc5003c, 1.6);
    rimCrimson.position.set(-4, 1.5, -3);
    scene.add(rimCrimson);
    const rimAqua = new THREE.DirectionalLight(0x55ead4, 1.2);
    rimAqua.position.set(4, -2, -2);
    scene.add(rimAqua);

    const group = new THREE.Group();
    scene.add(group);

    const pointer = { x: 0, y: 0 };
    const eased = { x: 0, y: 0 };
    const onMove = (e) => {
      const r = mount.getBoundingClientRect();
      if (r.width === 0) return;
      pointer.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      pointer.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    let cancelled = false;
    new GLTFLoader().load(
      src,
      (gltf) => {
        if (cancelled) return;
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const s = 2.6 / Math.max(size.x, size.y, size.z);
        model.scale.setScalar(s);
        model.position.set(-center.x * s, -center.y * s, -center.z * s);
        model.rotation.y = -0.5;
        group.add(model);
        setLoaded(true);
      },
      undefined,
      () => {
        if (!cancelled) setFailed(true);
      },
    );

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    const clock = new THREE.Clock();
    let raf = 0;
    let yaw = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      eased.x += (pointer.x - eased.x) * 0.055;
      eased.y += (pointer.y - eased.y) * 0.055;
      if (!reduced) yaw += 0.0032;
      group.rotation.y = yaw + eased.x * 0.55;
      group.rotation.x = eased.y * 0.32 + (reduced ? 0 : Math.sin(t * 0.7) * 0.05);
      group.position.y = reduced ? 0 : Math.sin(t * 0.85) * 0.09;
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', resize);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [src]);

  if (failed) return null;

  return (
    <div className="relative h-full w-full">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <div className="h-20 w-20 animate-pulse rounded-full border border-white/10" />
        </div>
      )}
      <div ref={mountRef} className={`h-full w-full transition-opacity duration-1000 ${loaded ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  );
}
