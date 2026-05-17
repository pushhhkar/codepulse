import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB(): Promise<void> {
  // Persistent connection event listeners — fire on reconnects and runtime errors
  // after the initial connect, not just on the first attempt.
  mongoose.connection.on('connected', () => {
    console.log('[Database] MongoDB Atlas connected successfully');
  });

  mongoose.connection.on('error', (err: Error) => {
    console.error(`[Database] MongoDB connection error: ${err.message}`);
    process.exit(1);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[Database] MongoDB connection lost');
  });

  // Attempt initial connection. If this rejects, the error listener above has
  // not yet fired (the 'error' event is only emitted on post-connect failures),
  // so we catch here, log, and exit to keep the behaviour consistent.
  await mongoose.connect(env.mongodbUri).catch((err: Error) => {
    console.error(`[Database] MongoDB connection error: ${err.message}`);
    process.exit(1);
  });
}
