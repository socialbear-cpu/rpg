import { buildApp } from './app.js';
import { loadConfig } from './config.js';

try {
  const config = loadConfig(process.env);
  const app = buildApp({
    nodeEnv: config.nodeEnv,
    logger: { redact: ['req.headers.authorization'] },
  });

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
