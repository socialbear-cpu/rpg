import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { healthRoutes } from './modules/health/health.routes.js';
import { profileRoutes } from './modules/profile/profile.routes.js';
import { dailyLoginRoutes } from './modules/daily-login/daily-login.routes.js';
import { systemMembershipRoutes } from './modules/system-membership/system-membership.routes.js';
import { notificationsRoutes } from './modules/notifications/notifications.routes.js';
import { experienceRoutes } from './modules/experience/experience.routes.js';
import { tradingRoutes } from './modules/trading/trading.routes.js';
import { gameSystemsRoutes } from './modules/game-systems/game-systems.routes.js';
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
  app.register(dailyLoginRoutes);
  app.register(systemMembershipRoutes);
  app.register(notificationsRoutes);
  app.register(experienceRoutes);
  app.register(tradingRoutes);
  app.register(gameSystemsRoutes);
}
