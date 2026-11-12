import { afterEach, beforeEach, expect, it } from 'vitest';
import { buildApp } from '../src/create-app.js';
import { profilePatchSchema } from '../src/modules/profile/profile.schema.js';

let app: ReturnType<typeof buildApp>;

beforeEach(() => { app = buildApp({ nodeEnv: 'development' }); });
afterEach(async () => { await app.close(); });

async function contract() {
  const response = await app.inject({ method: 'GET', url: '/docs/json' });
  expect(response.statusCode).toBe(200);
  const document = response.json();
  const resolve = (schema: { $ref?: string }) => schema.$ref
    ? document.components.schemas[schema.$ref.split('/').at(-1)!]
    : schema;
  return { document, resolve };
}

it('publishes bearer security for both profile operations while health stays public', async () => {
  const { document } = await contract();
  expect(document.components.securitySchemes?.bearerAuth).toMatchObject({
    type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
  });
  for (const method of ['get', 'patch']) {
    expect(document.paths['/api/v1/me/profile'][method].security).toEqual([{ bearerAuth: [] }]);
  }
  expect(document.security ?? []).toEqual([]);
  expect(document.paths['/healthz'].get.security ?? []).toEqual([]);
});

it('describes the public health and profile success payloads', async () => {
  const { document, resolve } = await contract();
  const health = document.paths['/healthz'].get;
  expect(health.summary).toBeTruthy();
  expect(resolve(health.responses['200'].content['application/json'].schema)).toMatchObject({
    required: ['status'], properties: { status: { type: 'string', enum: ['ok'] } },
  });
  for (const method of ['get', 'patch']) {
    const operation = document.paths['/api/v1/me/profile'][method];
    expect(operation.summary).toBeTruthy();
    expect(resolve(operation.responses['200'].content['application/json'].schema)).toMatchObject({
      required: ['user_id', 'username', 'display_name', 'avatar_url', 'bio'], additionalProperties: false,
      properties: {
        user_id: { type: 'string', format: 'uuid' },
        username: { type: 'string', nullable: true, minLength: 3, maxLength: 20, pattern: '^[a-z0-9_]+$' },
        display_name: { type: 'string' },
        avatar_url: { type: 'string', nullable: true }, bio: { type: 'string', nullable: true },
      },
    });
  }
});

it('publishes a required strict PATCH body with editable field limits and clearing semantics', async () => {
  const { document, resolve } = await contract();
  const body = document.paths['/api/v1/me/profile'].patch.requestBody;
  expect(body).toBeDefined();
  expect(body.required).toBe(true);
  expect(resolve(body.content['application/json'].schema)).toMatchObject({
    type: 'object', additionalProperties: false, minProperties: 1,
    properties: {
      display_name: { type: 'string', minLength: 1 },
      username: { type: 'string', minLength: 3, maxLength: 20, pattern: '^[a-zA-Z0-9_]+$' },
      avatar_url: { type: 'string', nullable: true, maxLength: 2048, format: 'uri', pattern: expect.any(String) },
      bio: { type: 'string', nullable: true, maxLength: 500 },
    },
  });
  expect(Object.keys(resolve(body.content['application/json'].schema).properties)).toEqual([
    'display_name', 'username', 'avatar_url', 'bio',
  ]);
  expect(document.paths['/api/v1/me/profile'].get.requestBody).toBeUndefined();
});

it('publishes an avatar pattern accepting HTTP and HTTPS schemes in every casing', async () => {
  const { document, resolve } = await contract();
  const body = document.paths['/api/v1/me/profile'].patch.requestBody;
  const avatar = resolve(body.content['application/json'].schema).properties.avatar_url;
  const pattern = new RegExp(avatar.pattern);

  for (const scheme of ['http', 'https', 'HTTP', 'HTTPS', 'hTtP', 'hTtPs']) {
    const avatar_url = `${scheme}://example.com/a.png`;
    expect(profilePatchSchema.safeParse({ avatar_url }).success).toBe(true);
    expect(pattern.test(avatar_url), avatar_url).toBe(true);
  }
  for (const scheme of ['ftp', 'FTPS', 'httpss', 'xhttp']) {
    const avatar_url = `${scheme}://example.com/a.png`;
    expect(profilePatchSchema.safeParse({ avatar_url }).success).toBe(false);
    expect(pattern.test(avatar_url), avatar_url).toBe(false);
  }
});

it('does not cap the raw display name length before runtime trimming', async () => {
  const { document, resolve } = await contract();
  const body = document.paths['/api/v1/me/profile'].patch.requestBody;
  const displayName = resolve(body.content['application/json'].schema).properties.display_name;
  // Runtime accepts 80 non-whitespace characters surrounded by whitespace.
  // A raw maxLength would incorrectly reject that valid client input.
  expect(displayName.maxLength).toBeUndefined();
  expect(displayName.description).toMatch(/trimmed before checking the 1–80 character limit/i);
});

it('documents profile authentication, missing-row and database errors plus PATCH validation errors', async () => {
  const { document, resolve } = await contract();
  for (const method of ['get', 'patch']) {
    const responses = document.paths['/api/v1/me/profile'][method].responses;
    for (const code of ['401', '404', '500', ...(method === 'patch' ? ['400', '409'] : [])]) {
      expect(responses[code].description).toBeTruthy();
      expect(resolve(responses[code].content['application/json'].schema)).toMatchObject({
        type: 'object', required: ['error'], properties: { error: { type: 'string' } },
      });
    }
    expect(responses['401'].description).toMatch(/token/i);
  }
  expect(document.paths['/api/v1/me/profile'].patch.responses['400'].description).toMatch(/invalid/i);
});
