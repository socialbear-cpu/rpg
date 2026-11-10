import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/healthz', {
    schema: {
      response: {
        200: {
          type: 'object',
          required: ['status'],
          properties: { status: { type: 'string', enum: ['ok'] } },
          additionalProperties: false,
        },
      },
    },
  }, async () => ({ status: 'ok' }));
}
