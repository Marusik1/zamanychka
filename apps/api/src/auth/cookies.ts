import type { CookiePolicy } from '../config/env.js';

export function sessionCookie(policy: CookiePolicy, maxAge: number) {
  return {
    path: policy.path,
    httpOnly: policy.httpOnly,
    sameSite: policy.sameSite,
    secure: policy.secure,
    maxAge,
  } as const;
}

export function clearSessionCookie(policy: CookiePolicy) {
  return {
    path: policy.path,
    httpOnly: policy.httpOnly,
    sameSite: policy.sameSite,
    secure: policy.secure,
    maxAge: 0,
    expires: new Date(0),
  } as const;
}
