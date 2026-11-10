import Fastify from 'fastify';
import { registerApp } from './register-app.js';
import { loadRuntimeConfig } from './config.js';

try {
  const config = loadRuntimeConfig(process.env);
  const app = Fastify({
    logger: { redact: ['req.headers.authorization'] },
  });
  registerApp(app, config.nodeEnv);

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void app.close().catch(() => {
        process.exitCode = 1;
      });
    });
  }

  await app.listen({ port: config.port, host: '0.0.0.0' });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Server startup failed');
  process.exitCode = 1;
}
