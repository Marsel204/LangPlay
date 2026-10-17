export function createStorage(backend) {
  return {
    read(key, fallback) {
      try { const raw = backend.get(`learning-v1:${key}`); return typeof raw === 'string' ? JSON.parse(raw) : fallback; }
      catch { return fallback; }
    },
    write(key, value) {
      const raw = JSON.stringify(value);
      if (raw.length > 4 * 1024 * 1024) throw new Error('LangPlay storage is full. Export your cards first.');
      backend.set(`learning-v1:${key}`, raw);
    },
  };
}
