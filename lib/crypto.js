'use strict';

/**
 * 敏感数据 AES-256-GCM 加密
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGO = 'aes-256-gcm';
const SENSITIVE_FILES = ['event_log.json', 'user_profile.json', 'companion_settings.json'];

function deriveKey(passphrase, salt) {
  return crypto.scryptSync(passphrase, salt, 32);
}

function getOrCreateSalt(dataDir) {
  const saltPath = path.join(dataDir, '.encryption_salt');
  if (fs.existsSync(saltPath)) return fs.readFileSync(saltPath);
  const salt = crypto.randomBytes(16);
  fs.writeFileSync(saltPath, salt);
  return salt;
}

function encryptText(text, passphrase, dataDir) {
  const salt = getOrCreateSalt(dataDir);
  const key = deriveKey(passphrase, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptText(payload, passphrase, dataDir) {
  const salt = getOrCreateSalt(dataDir);
  const key = deriveKey(passphrase, salt);
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function encryptFile(filePath, passphrase, dataDir) {
  const plain = fs.readFileSync(filePath, 'utf8');
  const enc = encryptText(plain, passphrase, dataDir);
  fs.writeFileSync(filePath + '.enc', enc);
  fs.writeFileSync(filePath + '.enc.meta', JSON.stringify({ encrypted: true, at: Date.now() }));
}

function decryptFile(encPath, passphrase, dataDir, outPath) {
  const enc = fs.readFileSync(encPath, 'utf8');
  const plain = decryptText(enc, passphrase, dataDir);
  fs.writeFileSync(outPath || encPath.replace(/\.enc$/, ''), plain);
  return plain;
}

function encryptSensitive(dataDir, passphrase) {
  if (!passphrase) throw new Error('需要加密口令');
  const results = [];
  for (const name of SENSITIVE_FILES) {
    const fp = path.join(dataDir, name);
    if (fs.existsSync(fp)) {
      encryptFile(fp, passphrase, dataDir);
      results.push(name);
    }
  }
  return results;
}

module.exports = {
  encryptText, decryptText, encryptFile, decryptFile,
  encryptSensitive, SENSITIVE_FILES
};
