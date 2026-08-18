import { z } from 'zod';

export const healthResponseSchema = z.object({ status: z.literal('ok') });

const dependencyStatusSchema = z.enum(['up', 'down']);

export const readinessResponseSchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  dependencies: z.object({
    postgres: dependencyStatusSchema,
    redis: dependencyStatusSchema,
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
