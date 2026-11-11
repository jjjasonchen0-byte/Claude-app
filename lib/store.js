// Tiny JSON-file persistence layer. Good enough for a small group of friends;
// swap for a real database if this ever needs to scale.
import fs from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(file) {
    this.file = file;
    this.data = { users: {}, sessions: {}, taIds: {} };
    this.saveTimer = null;
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data.users = parsed.users || {};
      this.data.sessions = parsed.sessions || {};
      this.data.taIds = parsed.taIds || {}; // OpenStreetMap place → Tripadvisor location ID
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`[store] could not read ${file}: ${err.message}`);
    }
  }

  get users() { return this.data.users; }
  get sessions() { return this.data.sessions; }

  /** Debounced atomic write (write to temp file, then rename). */
  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 50);
  }

  flush() {
    clearTimeout(this.saveTimer);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
