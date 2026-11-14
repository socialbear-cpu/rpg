import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteGameSystemCover, getGameSystemCoverUrl, uploadGameSystemCover } from '../src/api.js';
import { signIn, signOut } from '../src/supabase-auth.js';

const systemId = '37000000-0000-4000-8000-000000000001';
const calls: { url: string; method: string; headers: Headers; body: BodyInit | null | undefined }[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: init?.body,
    });
    return Response.json({ access_token: 'cover-test-token' });
  });
});

afterEach(async () => {
  await signOut();
  vi.unstubAllGlobals();
});

describe('system cover storage', () => {
  it('uploads owner-authenticated image files and builds their public URL', async () => {
    await signIn({ email: 'owner@example.test', password: 'secure-password' });
    calls.length = 0;
    const file = new File([new Uint8Array([1, 2, 3])], 'cover.png', { type: 'image/png' });
    const path = await uploadGameSystemCover(systemId, file);

    expect(path).toMatch(new RegExp(`^${systemId}/[0-9a-f-]{36}\\.png$`));
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toContain(`/storage/v1/object/game-system-covers/${systemId}/`);
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer cover-test-token');
    expect(calls[0]?.headers.get('content-type')).toBe('image/png');
    expect(calls[0]?.body).toBe(file);
    expect(getGameSystemCoverUrl(path)).toContain(`/storage/v1/object/public/game-system-covers/${path}`);
  });

  it('deletes only valid system cover paths and rejects unsupported uploads', async () => {
    await signIn({ email: 'owner@example.test', password: 'secure-password' });
    calls.length = 0;
    const path = `${systemId}/47000000-0000-4000-8000-000000000001.webp`;
    await deleteGameSystemCover(path);
    expect(calls[0]?.method).toBe('DELETE');
    expect(calls[0]?.body).toBe(JSON.stringify({ prefixes: [path] }));
    await expect(deleteGameSystemCover('other-system/cover.webp')).rejects.toThrow('Caminho de imagem inválido.');
    const unsupported = new File([new Uint8Array([1])], 'cover.svg', { type: 'image/svg+xml' });
    await expect(uploadGameSystemCover(systemId, unsupported)).rejects.toThrow('Use uma imagem JPEG, PNG, WebP ou AVIF.');
    expect(calls).toHaveLength(1);
  });
});
