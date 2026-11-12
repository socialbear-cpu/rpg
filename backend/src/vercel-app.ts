import { buildApp } from './create-app.js';
import { loadRuntimeConfig } from './config.js';

const config = loadRuntimeConfig(process.env);

const app = buildApp({
  logger: { redact: ['req.headers.authorization'] },
  nodeEnv: config.nodeEnv,
});

export default app;
