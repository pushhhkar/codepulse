import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(env.mongodbUri);
    console.log('[db] MongoDB connected');
  } catch (err) {
    console.error('[db] Connection failed:', err);
    process.exit(1);
  }
}
