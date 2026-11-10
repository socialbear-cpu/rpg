import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { healthRoutes } from './modules/health/health.routes.js';
import { profileRoutes } from './modules/profile/profile.routes.js';
import type { Config } from './config.js';

export function registerApp(app: FastifyInstance, nodeEnv: Config['nodeEnv']) {
  app.decorateRequest('userId', null);
  app.decorateRequest('supabase', null);

  app.register(swagger, {
    openapi: {
      info: { title: 'RPG API', version: '0.1.0' },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });

  if (nodeEnv === 'development') {
    app.register(swaggerUi, { routePrefix: '/docs' });
  }

  app.register(healthRoutes);
  app.register(profileRoutes);
}
