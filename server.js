/**
 * server.js  (entry point)
 * ---------------------------------------------------------------------------
 * ISMS - Internship and Scholarship Management System
 *
 * Responsibilities of this file:
 *   1. load the .env file
 *   2. sanity-check the configuration
 *   3. connect to MongoDB (printing Windows-friendly help if it is down)
 *   4. start the HTTP server
 *   5. shut down cleanly on Ctrl+C
 *
 * Everything else lives in app.js / config / models / controllers / routes.
 */
'use strict';

require('dotenv').config();

const app = require('./app');
const { connectDB, disconnectDB, WINDOWS_MONGODB_HELP } = require('./config/db');

const PORT = parseInt(process.env.PORT || '3000', 10);
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/isms_db';
const REQUIRED_ENV = ['JWT_SECRET', 'MONGO_URI'];

/** Warn (but do not crash) when a required environment variable is missing. */
function checkEnvironment() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length) {
    console.warn(`[config] Missing environment variable(s): ${missing.join(', ')}. Using safe defaults.`);
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'isms-development-secret-change-me';
  }
  if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET === 'change-this-to-a-long-random-secret-string-for-isms') {
    console.warn('[config] WARNING: you are running in production with the example JWT_SECRET. Change it in .env!');
  }
}

/** Boot the whole application. */
async function start() {
  checkEnvironment();

  console.log('');
  console.log('  ============================================================');
  console.log('   ISMS - Internship and Scholarship Management System');
  console.log('   Express + MongoDB (Mongoose) + EJS + Bootstrap 5');
  console.log('  ============================================================');
  console.log(`   environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   database    : ${MONGO_URI}`);
  console.log('');

  try {
    await connectDB(MONGO_URI);
  } catch (err) {
    // config/db.js already printed the exact Windows instructions.
    if (/ECONNREFUSED|server selection|topology|failed to connect/i.test(err.message)) {
      console.error(WINDOWS_MONGODB_HELP);
    }
    console.error('[server] Startup aborted: could not connect to MongoDB.');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`[server] ISMS is running at  http://localhost:${PORT}`);
    console.log(`[server] environment       ${process.env.NODE_ENV || 'development'}`);
    console.log('[server] Press Ctrl+C to stop.');
    console.log('');
  });

  // ---- graceful shutdown ---------------------------------------------------
  const shutdown = async (signal) => {
    console.log(`\n[server] ${signal} received - shutting down...`);
    server.close(async () => {
      try {
        await disconnectDB();
      } catch (err) {
        /* already closed */
      }
      console.log('[server] Bye.');
      process.exit(0);
    });
    // Never hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 8000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    console.error('[server] Unhandled promise rejection:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[server] Uncaught exception:', err);
    shutdown('uncaughtException');
  });

  return server;
}

if (require.main === module) {
  start();
}

module.exports = { app, start };