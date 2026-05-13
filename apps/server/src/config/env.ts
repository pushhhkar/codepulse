import 'dotenv/config';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  port: parseInt(process.env['PORT'] ?? '5000', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  mongodbUri: requireEnv('MONGODB_URI'),
  github: {
    clientId: requireEnv('GITHUB_CLIENT_ID'),
    clientSecret: requireEnv('GITHUB_CLIENT_SECRET'),
    callbackUrl: requireEnv('GITHUB_CALLBACK_URL'),
  },
  jwtSecret: requireEnv('JWT_SECRET'),
  clientUrl: requireEnv('CLIENT_URL'),
} as const;
