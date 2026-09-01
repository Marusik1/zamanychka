import * as THREE from 'three';

import { easeOutCubic } from './easing.js';
import { tween } from './tween.js';

export async function runParticleBurst(
  scene: THREE.Scene,
  center: THREE.Vector3,
  color: THREE.ColorRepresentation,
  count: number,
  signal?: AbortSignal,
): Promise<void> {
  const pieces: THREE.Mesh[] = [];
  const starts: THREE.Vector3[] = [];
  const velocities: THREE.Vector3[] = [];

  for (let index = 0; index < count; index += 1) {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const piece = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), material);
    piece.position.copy(center);
    piece.position.z += 0.12;
    scene.add(piece);
    pieces.push(piece);
    starts.push(piece.position.clone());

    const angle = (Math.PI * 2 * index) / count + (index % 3) * 0.09;
    const speed = 0.52 + (index % 5) * 0.08;
    velocities.push(new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed, 0.22 + (index % 4) * 0.05));
  }

  try {
    await tween(420, (t) => {
      const e = easeOutCubic(t);
      pieces.forEach((piece, index) => {
        const start = starts[index]!;
        const velocity = velocities[index]!;
        piece.position.set(
          start.x + velocity.x * e,
          start.y + velocity.y * e,
          start.z + velocity.z * Math.sin(Math.PI * t),
        );
        piece.scale.setScalar(1 - 0.78 * t);
        const material = piece.material as THREE.MeshBasicMaterial;
        material.opacity = 1 - t;
      });
    }, signal);
  } finally {
    for (const piece of pieces) {
      scene.remove(piece);
      piece.geometry.dispose();
      (piece.material as THREE.Material).dispose();
    }
  }
}
