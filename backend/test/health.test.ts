import { expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

it('health route returns 200 and { status: "ok" } without Supabase configuration', async () => {
  const app = buildApp();
  try {
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  } finally {
    await app.close();
  }
});

it('serves OpenAPI docs in development', async () => {
  const app = buildApp({ nodeEnv: 'development' });
  try {
    const response = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(response.statusCode).toBe(200);
    expect(response.json().paths['/healthz'].get).toBeDefined();
  } finally {
    await app.close();
  }
});

it('does not expose docs in production', async () => {
  const app = buildApp({ nodeEnv: 'production' });
  try {
    const response = await app.inject({ method: 'GET', url: '/docs' });
    expect(response.statusCode).toBe(404);
  } finally {
    await app.close();
  }
});
