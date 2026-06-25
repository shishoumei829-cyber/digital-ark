'use strict';

const fs = require('fs');
const path = require('path');

const ARCHIVE_TYPES = ['memory', 'relationship', 'emotion'];

class DialogArchiveStore {
  constructor(dataDir) {
    this.path = path.join(dataDir, 'dialog_archives.json');
    this.items = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.path)) return JSON.parse(fs.readFileSync(this.path, 'utf8'));
    } catch {}
    return [];
  }

  _save() {
    fs.writeFileSync(this.path, JSON.stringify(this.items, null, 2));
  }

  archive({ message, role, archive_type, companion_user_id }) {
    if (!ARCHIVE_TYPES.includes(archive_type)) throw new Error('无效归档类型');
    const item = {
      id: `arc_${Date.now()}`,
      message: String(message).slice(0, 2000),
      role: role || 'user',
      archive_type,
      companion_user_id: companion_user_id || 'default',
      status: 'pending',
      timestamp: Date.now()
    };
    this.items.push(item);
    this._save();
    return item;
  }

  listPending() {
    return this.items.filter(i => i.status === 'pending');
  }

  confirm(id, action = 'confirm') {
    const item = this.items.find(i => i.id === id);
    if (!item) throw new Error('归档不存在');
    item.status = action === 'reject' ? 'rejected' : 'confirmed';
    item.confirmed_at = Date.now();
    this._save();
    return item;
  }
}

module.exports = { DialogArchiveStore, ARCHIVE_TYPES };
