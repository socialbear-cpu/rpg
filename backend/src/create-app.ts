import Fastify, { type FastifyServerOptions } from 'fastify';
import { registerApp } from './register-app.js';
import type { Config } from './config.js';

export type AppOptions = FastifyServerOptions & { nodeEnv?: Config['nodeEnv'] };

export function buildApp({ nodeEnv = 'development', ...options }: AppOptions = {}) {
  const app = Fastify(options);
  registerApp(app, nodeEnv);
  return app;
}
