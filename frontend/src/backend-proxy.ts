export async function forwardToBackend(request: Request) {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return Response.json({ error: 'Backend service is unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }

  const incomingUrl = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete('connection');
  headers.delete('content-length');
  headers.delete('host');

  const timeout = AbortSignal.timeout(15_000);
  let upstream: Response;
  let targetHost: string | undefined;
  try {
    const targetBaseUrl = new URL(backendUrl);
    targetBaseUrl.pathname = `${targetBaseUrl.pathname.replace(/\/+$/, '')}/`;
    targetBaseUrl.search = '';
    targetBaseUrl.hash = '';
    const targetUrl = new URL(
      `${incomingUrl.pathname.replace(/^\/+/, '')}${incomingUrl.search}`,
      targetBaseUrl,
    );
    targetHost = targetUrl.host;
    upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      ...(request.method === 'GET' ? {} : { body: await request.arrayBuffer() }),
      cache: 'no-store',
      redirect: 'manual',
      signal: timeout,
    });
  } catch (error) {
    console.error('Backend proxy request failed', {
      method: request.method,
      path: incomingUrl.pathname,
      targetHost,
      reason: error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error',
    });
    return Response.json(
      { error: 'Backend service is unavailable' },
      { status: timeout.aborted ? 504 : 502, headers: { 'cache-control': 'no-store' } },
    );
  }

  const responseHeaders = new Headers({ 'cache-control': 'no-store' });
  const contentType = upstream.headers.get('content-type');
  if (contentType) responseHeaders.set('content-type', contentType);
  const body = [204, 205, 304].includes(upstream.status) ? null : upstream.body;
  return new Response(body, { status: upstream.status, headers: responseHeaders });
}
