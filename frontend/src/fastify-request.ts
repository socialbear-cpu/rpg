import { buildApp } from '../../backend/src/create-app';

const bodylessStatuses = new Set([204, 205, 304]);
const hopByHopHeaders = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

let app: ReturnType<typeof buildApp> | undefined;

function getApp() {
  app ??= buildApp({
    nodeEnv: 'production',
    logger: { redact: ['req.headers.authorization'] },
  });
  return app;
}

export async function handleFastifyRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const headers = Object.fromEntries(
    [...request.headers].filter(([name]) => !hopByHopHeaders.has(name.toLowerCase())),
  );
  const body = ['GET', 'HEAD'].includes(request.method)
    ? undefined
    : Buffer.from(await request.arrayBuffer());

  const result = await getApp().inject({
    method: request.method,
    url: `${url.pathname}${url.search}`,
    headers,
    ...(body === undefined ? {} : { payload: body }),
  });

  const responseHeaders = new Headers();
  for (const [name, value] of Object.entries(result.headers)) {
    if (value === undefined || hopByHopHeaders.has(name.toLowerCase())) continue;
    for (const headerValue of Array.isArray(value) ? value : [value]) {
      responseHeaders.append(name, String(headerValue));
    }
  }

  return new Response(bodylessStatuses.has(result.statusCode) ? null : result.payload, {
    status: result.statusCode,
    headers: responseHeaders,
  });
}
