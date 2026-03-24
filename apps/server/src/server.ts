import { bootstrap } from "global-agent";

// Enable HTTP proxy for all outbound requests if http_proxy / https_proxy is set
bootstrap();

import { buildApp } from "./app.js";
import { loadServerEnv } from "./config/env.js";

const env = loadServerEnv();
const app = buildApp({
  env,
});

try {
  await app.listen({
    host: "127.0.0.1",
    port: env.port,
  });

  console.log(`@loomic/server listening on http://127.0.0.1:${env.port}`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
