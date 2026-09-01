import { describe, expect, it } from 'vitest';

import { committedFaceQuaternion } from './die-mesh.js';

describe('premium 3D die', () => {
  it('provides a deterministic final orientation for every committed face', () => {
    for (const value of [1, 2, 3, 4, 5, 6] as const) {
      const quaternion = committedFaceQuaternion(value);
      expect(Number.isFinite(quaternion.x)).toBe(true);
      expect(Number.isFinite(quaternion.y)).toBe(true);
      expect(Number.isFinite(quaternion.z)).toBe(true);
      expect(Number.isFinite(quaternion.w)).toBe(true);
      expect(quaternion.length()).toBeCloseTo(1, 6);
    }
  });
});
