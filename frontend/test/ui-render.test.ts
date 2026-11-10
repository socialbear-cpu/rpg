import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RpgApp } from '../app/rpg-app.js';
import { checkHealth } from '../src/api.js';

describe('initial application UI', () => {
  it('shows the login tab selected and keeps profile controls disabled without a session', () => {
    const html = renderToStaticMarkup(createElement(RpgApp));
    expect(html).toContain('role="tab" aria-selected="true" aria-controls="panel-auth"');
    expect(html).toContain('id="tab-signup" type="button" role="tab" aria-selected="false"');
    expect(html).toContain('id="profile-name"');
    expect(html).toMatch(/id="profile-name"[^>]*disabled/);
    expect(html).toMatch(/disabled=""[^>]*>Salvar alterações/);
  });

  it('checks API health through the same-origin path', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBe('/healthz');
      return Response.json({ status: 'ok' });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(checkHealth()).resolves.toEqual({ status: 'ok' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
