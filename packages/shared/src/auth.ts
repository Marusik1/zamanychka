import { z } from 'zod';

export const telegramAuthRequestSchema = z
  .object({
    initData: z.string().min(1),
  })
  .strict();

export const devAuthRequestSchema = z
  .object({
    devUserKey: z.string().min(1),
  })
  .strict();

export const authUserSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    username: z.string().min(1).optional(),
    photoUrl: z.string().min(1).optional(),
    languageCode: z.string().min(1).optional(),
    authProvider: z.enum(['TELEGRAM', 'DEVELOPMENT']),
  })
  .strict();

export const authSessionViewSchema = z
  .object({
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const authSuccessSchema = z
  .object({
    user: authUserSchema,
    session: authSessionViewSchema,
  })
  .strict();

export const meResponseSchema = z
  .object({
    user: authUserSchema,
  })
  .strict();

const devAuthUserSchema = z
  .object({
    devUserKey: z.string().min(1),
    displayName: z.string().min(1),
  })
  .strict();

export const devAuthCapabilitySchema = z.discriminatedUnion('enabled', [
  z
    .object({
      enabled: z.literal(false),
      users: z.tuple([]),
    })
    .strict(),
  z
    .object({
      enabled: z.literal(true),
      users: z.array(devAuthUserSchema),
    })
    .strict(),
]);

export const publicErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'AUTH_REQUIRED',
  'TELEGRAM_AUTH_INVALID',
  'ORIGIN_NOT_ALLOWED',
  'NOT_FOUND',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'AUTH_SESSION_REPLACED',
]);

export const publicErrorSchema = z
  .object({
    error: z
      .object({
        code: publicErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export type TelegramAuthRequest = z.infer<typeof telegramAuthRequestSchema>;
export type DevAuthRequest = z.infer<typeof devAuthRequestSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthSessionView = z.infer<typeof authSessionViewSchema>;
export type AuthSuccess = z.infer<typeof authSuccessSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type DevAuthCapability = z.infer<typeof devAuthCapabilitySchema>;
export type PublicErrorCode = z.infer<typeof publicErrorCodeSchema>;
export type PublicError = z.infer<typeof publicErrorSchema>;
