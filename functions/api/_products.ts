export const nowIso = () => new Date().toISOString();

export const createId = (prefix: string) => {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
};

export const toBoolInt = (value: unknown, defaultValue = 0) => {
  if (value === undefined || value === null || value === "") return defaultValue;
  return Number(value) ? 1 : 0;
};

export const parseEffects = (effectsJson: unknown): string[] => {
  if (!effectsJson || typeof effectsJson !== "string") return [];
  try {
    const parsed = JSON.parse(effectsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => String(value)).filter(Boolean);
  } catch {
    return [];
  }
};

export const slugify = (input: string) =>
  String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "product";

export const uniqueSlug = async (db: D1Database, desired: string) => {
  const base = slugify(desired);
  let slug = base;
  let n = 2;

  while (true) {
    const row = await db.prepare("SELECT id FROM products WHERE slug = ?").bind(slug).first();
    if (!row) return slug;
    slug = `${base}-${n}`;
    n += 1;
  }
};

const tableColumnsCache = new Map<string, Promise<Set<string>>>();

export const getTableColumns = async (db: D1Database, table: string): Promise<Set<string>> => {
  const cacheKey = table.toLowerCase();
  if (!tableColumnsCache.has(cacheKey)) {
    tableColumnsCache.set(
      cacheKey,
      (async () => {
        try {
          const pragma = await db.prepare(`PRAGMA table_info(${table})`).all<any>();
          return new Set((pragma.results || []).map((column: any) => String(column?.name || "").toLowerCase()).filter(Boolean));
        } catch {
          return new Set<string>();
        }
      })()
    );
  }
  return tableColumnsCache.get(cacheKey)!;
};

export const sanitizeFilename = (name: string) =>
  String(name || "file")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/(^-|-$)/g, "") || "file";
