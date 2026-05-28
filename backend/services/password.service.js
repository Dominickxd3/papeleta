const crypto = require('crypto');

const PBKDF2_PREFIX = 'pbkdf2';
const PBKDF2_ITERATIONS = 120000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';

function hashPassword(password) {
  const plain = String(password || '');
  if (!plain) {
    throw new Error('La contraseña no puede estar vacía');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(plain, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
  return `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${salt}$${derived.toString('hex')}`;
}

function isHashedPassword(value) {
  return typeof value === 'string' && value.startsWith(`${PBKDF2_PREFIX}$`);
}

function verifyPassword(password, storedHash) {
  try {
    if (!isHashedPassword(storedHash)) return false;

    const parts = storedHash.split('$');
    if (parts.length !== 4) return false;

    const iterations = Number(parts[1]);
    const salt = parts[2];
    const hashHex = parts[3];
    if (!Number.isInteger(iterations) || iterations <= 0 || !salt || !hashHex) {
      return false;
    }

    const plain = String(password || '');
    const derived = crypto.pbkdf2Sync(plain, salt, iterations, PBKDF2_KEYLEN, PBKDF2_DIGEST);
    const hashBuffer = Buffer.from(hashHex, 'hex');
    if (hashBuffer.length !== derived.length) return false;
    return crypto.timingSafeEqual(hashBuffer, derived);
  } catch {
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  isHashedPassword
};
