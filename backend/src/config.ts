import { z } from 'zod';

const configSchema = z.object({
  SUPABASE_URL: z.url().refine((value) => /^https?:\/\//.test(value)),
  SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(1),
  PORT: z.string().regex(/^\d+$/).default('3000').transform(Number)
    .pipe(z.number().int().min(1).max(65535)),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export function loadConfig(env: Record<string, string | undefined>) {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path[0]))];
    throw new Error(`Invalid configuration: ${fields.join(', ')}`);
  }

  return {
    supabaseUrl: result.data.SUPABASE_URL,
    supabasePublishableKey: result.data.SUPABASE_PUBLISHABLE_KEY,
    port: result.data.PORT,
    nodeEnv: result.data.NODE_ENV,
  };
}

export type Config = ReturnType<typeof loadConfig>;
