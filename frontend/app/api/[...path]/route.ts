import { forwardToBackend } from '../../../src/backend-proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = forwardToBackend;
export const PATCH = forwardToBackend;
export const POST = forwardToBackend;
