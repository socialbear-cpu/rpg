import Fastify, { type FastifyServerOptions } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { healthRoutes } from './modules/health/health.routes.js';
import { profileRoutes } from './modules/profile/profile.routes.js';
import type { Config } from './config.js';

export type AppOptions = FastifyServerOptions & { nodeEnv?: Config['nodeEnv'] };

export function buildApp({ nodeEnv = 'development', ...options }: AppOptions = {}) {
  const app = Fastify(options);
  app.decorateRequest('userId', null);
  app.decorateRequest('supabase', null);

  app.register(swagger, {
    openapi: {
      info: { title: 'RPG API', version: '0.1.0' },
    },
  });

  if (nodeEnv === 'development') {
    app.register(swaggerUi, { routePrefix: '/docs' });
  }

  app.register(healthRoutes);
  app.register(profileRoutes);
  return app;
}
