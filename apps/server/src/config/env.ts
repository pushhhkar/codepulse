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
  webhookSecret: requireEnv('WEBHOOK_SECRET'),
  clientUrl: requireEnv('CLIENT_URL'),
  geminiApiKey: requireEnv('GEMINI_API_KEY'),
  encryptionKey: requireEnv('ENCRYPTION_KEY'),
  sandbox: {
    image: process.env['SANDBOX_IMAGE'] ?? 'codepulse-sandbox:latest',
    timeoutMs: parseInt(process.env['SANDBOX_TIMEOUT_MS'] ?? '10000', 10),
    maxCodeBytes: parseInt(process.env['SANDBOX_MAX_CODE_BYTES'] ?? '65536', 10),
  },
} as const;
