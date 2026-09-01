import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

const PIP_POSITIONS: Record<DieValue, readonly [number, number][]> = {
  1: [[0, 0]],
  2: [[-0.18, 0.18], [0.18, -0.18]],
  3: [[-0.18, 0.18], [0, 0], [0.18, -0.18]],
  4: [[-0.18, 0.18], [0.18, 0.18], [-0.18, -0.18], [0.18, -0.18]],
  5: [[-0.18, 0.18], [0.18, 0.18], [0, 0], [-0.18, -0.18], [0.18, -0.18]],
  6: [[-0.18, 0.22], [-0.18, 0], [-0.18, -0.22], [0.18, 0.22], [0.18, 0], [0.18, -0.22]],
};

function addPipsOnFace(
  group: THREE.Group,
  value: DieValue,
  normal: THREE.Vector3,
  u: THREE.Vector3,
  v: THREE.Vector3,
) {
  const pipMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x090908,
    roughness: 0.34,
    clearcoat: 0.1,
  });
  for (const [px, py] of PIP_POSITIONS[value]) {
    const pip = new THREE.Mesh(new THREE.SphereGeometry(0.058, 18, 12), pipMaterial);
    pip.scale.z = 0.38;
    pip.position
      .copy(normal)
      .multiplyScalar(0.505)
      .addScaledVector(u, px)
      .addScaledVector(v, py);
    pip.lookAt(normal.clone().multiplyScalar(2));
    group.add(pip);
  }
}

export function createPremiumDieMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(1, 1, 1, 6, 0.14),
    new THREE.MeshPhysicalMaterial({
      color: 0xf4efe2,
      roughness: 0.23,
      metalness: 0,
      clearcoat: 0.46,
      clearcoatRoughness: 0.19,
    }),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Face assignment chosen for a visually balanced standard die.
  addPipsOnFace(group, 4, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
  addPipsOnFace(group, 3, new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0));
  addPipsOnFace(group, 5, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0));
  addPipsOnFace(group, 2, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
  addPipsOnFace(group, 6, new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1));
  addPipsOnFace(group, 1, new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1));

  return group;
}

export function committedFaceQuaternion(value: DieValue): THREE.Quaternion {
  const euler = (() => {
    switch (value) {
      case 4:
        return new THREE.Euler(0, 0, 0);
      case 3:
        return new THREE.Euler(0, Math.PI, 0);
      case 5:
        return new THREE.Euler(0, -Math.PI / 2, 0);
      case 2:
        return new THREE.Euler(0, Math.PI / 2, 0);
      case 6:
        return new THREE.Euler(Math.PI / 2, 0, 0);
      case 1:
        return new THREE.Euler(-Math.PI / 2, 0, 0);
    }
  })();
  return new THREE.Quaternion().setFromEuler(euler);
}
