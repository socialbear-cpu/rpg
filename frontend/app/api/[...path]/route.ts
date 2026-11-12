import { handleFastifyRequest } from '../../../src/fastify-request';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handleFastifyRequest;
export const PATCH = handleFastifyRequest;
export const POST = handleFastifyRequest;
export const PUT = handleFastifyRequest;
