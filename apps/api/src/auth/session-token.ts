import { createHash, randomBytes } from 'node:crypto';

export type EntropySource = (size: number) => Uint8Array;

export function createSessionToken(entropy: EntropySource = randomBytes): string {
  return Buffer.from(entropy(32)).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
