import crypto from 'node:crypto';
import { env } from '../config/env.js';

// AES-256-GCM: authenticated encryption — tampering with the ciphertext is
// detected at decrypt time (the auth tag check throws).
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce, the GCM-recommended size

// Derive a deterministic 32-byte key from ENCRYPTION_KEY (any length/format works).
// `env.encryptionKey` is validated as present at startup by config/env.ts.
const KEY = crypto.createHash('sha256').update(env.encryptionKey).digest();

/**
 * Encrypts UTF-8 text. Output layout: `ivHex:authTagHex:cipherHex`.
 * A fresh random IV is generated per call, so encrypting the same input twice
 * yields different ciphertext.
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Reverses `encrypt()`. Throws if the payload is malformed or has been tampered
 * with (GCM auth tag verification fails).
 */
export function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, cipherHex] = encryptedText.split(':');
  if (!ivHex || !authTagHex || !cipherHex) {
    throw new Error('[encryption] Malformed ciphertext — expected "iv:authTag:data".');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
