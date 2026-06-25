'use strict';

/**
 * 数据备份与恢复
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const SKIP = new Set(['.encryption_salt']);

function walk(dir, base = dir, out = {}) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name) || name === 'backups') continue;
    const full = path.join(dir, name);
    const rel = path.relative(base, full).replace(/\\/g, '/');
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, base, out);
    else if (stat.isFile() && !name.endsWith('.enc.meta')) {
      out[rel] = fs.readFileSync(full, 'utf8');
    }
  }
  return out;
}

function writeTree(base, files) {
  for (const [rel, content] of Object.entries(files)) {
    const fp = path.join(base, rel);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, content);
  }
}

class BackupManager {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.backupDir = path.join(dataDir, 'backups');
    if (!fs.existsSync(this.backupDir)) fs.mkdirSync(this.backupDir, { recursive: true });
  }

  async exportBundle() {
    const bundle = {
      version: 1,
      app: 'digital-ark',
      exported_at: new Date().toISOString(),
      files: walk(this.dataDir, this.dataDir)
    };
    delete bundle.files['backups'];
    const json = JSON.stringify(bundle);
    const compressed = await gzip(json);
    const filename = `backup_${Date.now()}.json.gz`;
    const filepath = path.join(this.backupDir, filename);
    fs.writeFileSync(filepath, compressed);
    return { filename, filepath, size: compressed.length, file_count: Object.keys(bundle.files).length };
  }

  async exportDownload() {
    const bundle = {
      version: 1,
      app: 'digital-ark',
      exported_at: new Date().toISOString(),
      files: walk(this.dataDir, this.dataDir)
    };
    const json = JSON.stringify(bundle);
    return gzip(json);
  }

  async importBundle(buffer) {
    let json;
    try {
      json = await gunzip(buffer);
    } catch {
      json = buffer;
    }
    const bundle = JSON.parse(json.toString('utf8'));
    if (!bundle.files || bundle.version !== 1) throw new Error('无效的备份格式');
    writeTree(this.dataDir, bundle.files);
    return { imported: Object.keys(bundle.files).length, exported_at: bundle.exported_at };
  }

  listBackups() {
    if (!fs.existsSync(this.backupDir)) return [];
    return fs.readdirSync(this.backupDir)
      .filter(f => f.endsWith('.json.gz'))
      .map(f => {
        const fp = path.join(this.backupDir, f);
        const stat = fs.statSync(fp);
        return { name: f, size: stat.size, created: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.created.localeCompare(a.created));
  }
}

module.exports = { BackupManager };
