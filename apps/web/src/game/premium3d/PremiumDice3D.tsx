import * as THREE from 'three';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { committedFaceQuaternion, createPremiumDieMesh, type DieValue } from './die-mesh.js';
import { easeOutCubic, easeOutQuint, lerp } from './easing.js';
import { PREMIUM_MOTION } from './motion-tokens.js';
import { tween } from './tween.js';

export type PremiumDice3DHandle = Readonly<{
  throwCommitted: (value: DieValue, signal?: AbortSignal) => Promise<void>;
  snapToValue: (value: DieValue) => void;
}>;

export const PremiumDice3D = forwardRef<
  PremiumDice3DHandle,
  {
    value: DieValue;
    className?: string;
    label?: string;
    onReady?: () => void;
    onUnavailable?: (error: unknown) => void;
  }
>(function PremiumDice3D({ value, className, label = `Кубик: ${value}`, onReady, onUnavailable }, forwardedRef) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const isUnsupportedRuntime =
    typeof window === 'undefined' ||
    typeof ResizeObserver === 'undefined' ||
    (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent));
  const runtimeRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    die: THREE.Group;
    shadow: THREE.Mesh;
    resizeObserver: ResizeObserver;
    raf: number;
    disposed: boolean;
  } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (isUnsupportedRuntime) {
      onUnavailable?.(new Error('Premium die requires ResizeObserver support'));
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (error) {
      onUnavailable?.(error);
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
    camera.position.set(0, 1.6, 5.3);
    camera.lookAt(0, 0.15, 0);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'premium-die-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xf4ead8, 0x18130e, 1.45));
    const key = new THREE.DirectionalLight(0xffd6a1, 4.2);
    key.position.set(-3, 5, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fc3e4, 1.1);
    rim.position.set(3, 2, 4);
    scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 3),
      new THREE.ShadowMaterial({ opacity: 0.26, color: 0x000000 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.67;
    floor.receiveShadow = true;
    scene.add(floor);

    const die = createPremiumDieMesh();
    die.scale.setScalar(0.82);
    die.quaternion.copy(committedFaceQuaternion(value));
    scene.add(die);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.6, 48),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.655;
    shadow.scale.set(1.1, 0.42, 1);
    scene.add(shadow);

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const runtime = { scene, camera, renderer, die, shadow, resizeObserver, raf: 0, disposed: false };
    runtimeRef.current = runtime;
    const render = () => {
      if (runtime.disposed) return;
      renderer.render(scene, camera);
      runtime.raf = requestAnimationFrame(render);
    };
    render();
    onReady?.();

    return () => {
      runtimeRef.current = null;
      runtime.disposed = true;
      cancelAnimationFrame(runtime.raf);
      resizeObserver.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [isUnsupportedRuntime]);

  useEffect(() => {
    runtimeRef.current?.die.quaternion.copy(committedFaceQuaternion(value));
  }, [value]);

  useImperativeHandle(forwardedRef, () => ({
    snapToValue(nextValue) {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      runtime.die.position.set(0, 0, 0);
      runtime.die.quaternion.copy(committedFaceQuaternion(nextValue));
      runtime.shadow.position.x = 0;
      (runtime.shadow.material as THREE.MeshBasicMaterial).opacity = 0.16;
    },
    async throwCommitted(nextValue, signal) {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      const { die, shadow } = runtime;
      const finalQuaternion = committedFaceQuaternion(nextValue);
      const spinAtCorrection = new THREE.Quaternion();

      await tween(PREMIUM_MOTION.dieThrowMs, (t) => {
        const mainLanding = 0.66;
        const secondLanding = 0.86;
        let x = 0;
        let y = 0;

        if (t < mainLanding) {
          const u = t / mainLanding;
          x = lerp(-0.58, 0.34, easeOutCubic(u));
          y = 1.15 * Math.sin(Math.PI * u);
        } else if (t < secondLanding) {
          const u = (t - mainLanding) / (secondLanding - mainLanding);
          x = lerp(0.34, 0.10, easeOutCubic(u));
          y = 0.30 * Math.sin(Math.PI * u);
        } else {
          const u = (t - secondLanding) / (1 - secondLanding);
          x = lerp(0.10, 0, easeOutQuint(u));
          y = 0.10 * Math.sin(Math.PI * u);
        }

        die.position.set(x, y, 0);
        shadow.position.x = x * 0.75;
        shadow.scale.setScalar(lerp(0.72, 1.08, 1 - Math.min(1, y / 1.15)));
        (shadow.material as THREE.MeshBasicMaterial).opacity = lerp(0.06, 0.18, 1 - Math.min(1, y / 1.15));

        if (t < 0.78) {
          die.rotation.set(t * Math.PI * 6.2, t * Math.PI * 5.4, t * Math.PI * 3.6);
          if (t > 0.76) spinAtCorrection.copy(die.quaternion);
        } else {
          const u = easeOutQuint((t - 0.78) / 0.22);
          die.quaternion.slerpQuaternions(spinAtCorrection, finalQuaternion, u);
        }
      }, signal);

      await tween(PREMIUM_MOTION.dieSettleMs, (t) => {
        const bounce = Math.sin(Math.PI * t) * (1 - t);
        die.position.y = 0.065 * bounce;
        die.scale.setScalar(0.82 * (1 + 0.018 * bounce));
      }, signal);

      die.position.set(0, 0, 0);
      die.scale.setScalar(0.82);
      die.quaternion.copy(finalQuaternion);
    },
  }), []);

  return (
    <div
      ref={hostRef}
      className={['premium-die-3d', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      data-die-value={value}
    />
  );
});
