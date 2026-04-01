import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

export interface EncryptedBlob {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
}

function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, KEY_LEN);
}

/** Pack iv|ciphertext|tag for DB storage as single binary. */
export function packEncryptedBlob(blob: EncryptedBlob): Buffer {
  const v = Buffer.alloc(1);
  v.writeUInt8(blob.keyVersion & 0xff);
  return Buffer.concat([
    v,
    blob.iv,
    blob.authTag,
    blob.ciphertext,
  ]);
}

export function unpackEncryptedBlob(buf: Buffer): EncryptedBlob {
  const keyVersion = buf.readUInt8(0);
  const iv = buf.subarray(1, 1 + IV_LEN);
  const authTag = buf.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(1 + IV_LEN + TAG_LEN);
  return { keyVersion, iv, authTag, ciphertext };
}

/**
 * AES-256-GCM encrypt. Uses per-field random IV. FR-06.
 * @param masterSecret - Env/master secret; replace with KMS unwrap in production.
 */
export function encryptPayload(
  plaintext: Uint8Array,
  masterSecret: string,
  fixedSalt: Buffer,
  keyVersion = 1,
): EncryptedBlob {
  const key = deriveKey(masterSecret, fixedSalt);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext: encrypted, iv, authTag, keyVersion };
}

export function decryptPayload(blob: EncryptedBlob, masterSecret: string, fixedSalt: Buffer): Buffer {
  const key = deriveKey(masterSecret, fixedSalt);
  const decipher = createDecipheriv(ALGO, key, blob.iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(blob.authTag);
  return Buffer.concat([decipher.update(blob.ciphertext), decipher.final()]);
}
