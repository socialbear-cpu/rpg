export async function forwardToBackend(request: Request) {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return Response.json({ error: 'Backend service is unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }

  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, backendUrl);
  const headers = new Headers(request.headers);
  headers.delete('connection');
  headers.delete('content-length');
  headers.delete('host');

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    ...(request.method === 'GET' ? {} : { body: await request.arrayBuffer() }),
    cache: 'no-store',
    redirect: 'manual',
  });

  const responseHeaders = new Headers({ 'cache-control': 'no-store' });
  const contentType = upstream.headers.get('content-type');
  if (contentType) responseHeaders.set('content-type', contentType);
  const body = [204, 205, 304].includes(upstream.status) ? null : upstream.body;
  return new Response(body, { status: upstream.status, headers: responseHeaders });
}
