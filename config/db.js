/**
 * config/db.js
 * ---------------------------------------------------------------------------
 * Centralised MongoDB connection using Mongoose.
 * Produces human friendly (Windows specific) guidance when the database server
 * cannot be reached, instead of an obscure driver stack trace.
 */
'use strict';

const mongoose = require('mongoose');

/** Instructions printed when the local MongoDB server is unreachable. */
const WINDOWS_MONGODB_HELP = [
  '',
  '==========================================================================',
  '  MongoDB is NOT reachable - the ISMS server cannot start.',
  '==========================================================================',
  '  Fix it on Windows (choose ONE of the options below):',
  '',
  '  1) If MongoDB is installed as a Windows service, open PowerShell',
  '     "Run as Administrator" and run:',
  '         net start MongoDB',
  '     (check the exact service name with:  Get-Service MongoDB*)',
  '',
  '  2) If the service does not exist, start mongod manually from an',
  '     Administrator PowerShell:',
  '         & "C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe" --dbpath "C:\\data\\db"',
  '     (replace 7.0 with your installed server version, and make sure C:\\data\\db exists)',
  '',
  '  3) Or point .env at a free MongoDB Atlas cluster:',
  '         MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/isms_db',
  '',
  '  Expected local connection string: mongodb://127.0.0.1:27017/isms_db',
  '==========================================================================',
  ''
].join('\n');

/**
 * Connect to MongoDB.
 * @param {string} uri - Mongoose connection string
 * @returns {Promise<import('mongoose').Mongoose>} the mongoose instance
 */
async function connectDB(uri) {
  // Fail fast (5 s) instead of buffering commands forever when Mongo is down.
  mongoose.set('bufferCommands', false);

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      autoIndex: true
    });
    console.log(`[db] MongoDB connected -> ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.error(`[db] Connection failed: ${err.message}`);
    if (/ECONNREFUSED|failed to connect|server selection|topology/i.test(err.message)) {
      console.error(WINDOWS_MONGODB_HELP);
    }
    throw err;
  }
}

/** Close the connection (used on graceful shutdown and by the seed script). */
async function disconnectDB() {
  await mongoose.connection.close();
  console.log('[db] MongoDB connection closed');
}

module.exports = { connectDB, disconnectDB, WINDOWS_MONGODB_HELP };