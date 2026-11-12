import { describe, expect, it } from 'vitest';
import { GET as getHealth } from '../app/healthz/route.js';
import { GET as getApi, PATCH as patchApi } from '../app/api/[...path]/route.js';

describe('Next.js routes backed by the in-process Fastify app', () => {
  it('reports health from Fastify', async () => {
    const response = await getHealth(new Request('https://rpg.example/healthz'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('keeps profile reads behind Fastify authentication', async () => {
    const response = await getApi(new Request('https://rpg.example/api/v1/me/profile?view=full'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('keeps profile updates behind Fastify authentication', async () => {
    const response = await patchApi(new Request('https://rpg.example/api/v1/me/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ display_name: 'Player' }),
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });
});
