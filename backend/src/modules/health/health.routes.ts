import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/healthz', {
    schema: {
      summary: 'Check API process health',
      description: 'Public liveness check. Does not check Supabase connectivity or database readiness.',
      security: [],
      response: {
        200: {
          description: 'API process is running.',
          type: 'object',
          required: ['status'],
          properties: { status: { type: 'string', enum: ['ok'] } },
          additionalProperties: false,
        },
      },
    },
  }, async () => ({ status: 'ok' }));
}
