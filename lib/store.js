// Tiny JSON-file persistence for the server's lookup caches (which Tripadvisor
// and Google place a map place matches). People's own data is never kept here:
// it is saved on their device.
import fs from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(file) {
    this.file = file;
    this.data = { taIds: {}, gIds: {} };
    this.saveTimer = null;
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data.taIds = parsed.taIds || {}; // OpenStreetMap place → Tripadvisor location ID
      this.data.gIds = parsed.gIds || {}; // OpenStreetMap place → Google place ID (the only Google content Google allows keeping)
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`[store] could not read ${file}: ${err.message}`);
    }
  }

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
