// @ts-check
/**
 * Public REST API service.
 *
 * `/api/v1` used to be mounted inside the web dashboard, so the API only
 * existed while `DASHBOARD_ENABLED` was on. It now has its own Express app:
 * the bot can serve the API while the dashboard stays off, and the dashboard
 * can be retired without taking the API with it.
 *
 * Enable with `PUBLIC_API_ENABLED=true`. Bind address and port come from
 * `PUBLIC_API_HOST` / `PUBLIC_API_PORT` (default 127.0.0.1:3001).
 */

'use strict';

const express = require('express');
const { registerPublicApiRoutes } = require('./routes');

/**
 * @param {import('discord.js').Client} client
 * @returns {import('express').Express}
 */
function createPublicApiApp(client) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  registerPublicApiRoutes(app, client);
  return app;
}

/**
 * @param {{ client: import('discord.js').Client, port?: number, host?: string }} options
 * @returns {{ app: import('express').Express, server: import('http').Server, port: number, host: string }}
 */
function startPublicApi({ client, port, host }) {
  const resolvedPort = Number(port ?? process.env.PUBLIC_API_PORT ?? 3001);
  const resolvedHost = String(host ?? process.env.PUBLIC_API_HOST ?? '127.0.0.1');
  const app = createPublicApiApp(client);

  const server = app.listen(resolvedPort, resolvedHost, () => {
    console.log(`🌐 Public API listening on http://${resolvedHost}:${resolvedPort}/api/v1`);
  });

  // A busy port must not take the bot down with it.
  server.on('error', (error) => {
    console.error(`Public API server error: ${/** @type {any} */ (error)?.message || error}`);
  });

  return { app, server, port: resolvedPort, host: resolvedHost };
}

module.exports = { createPublicApiApp, startPublicApi };
