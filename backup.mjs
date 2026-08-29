// SportScore database backup.
//
// Copies the live SQLite file into data/backups/ with a timestamp, keeping the
// most recent BACKUPS_TO_KEEP. On Render the /data disk persists across
// redeploys, so a boot-time backup preserves the previous state before any new
// writes. Real SQLite transactions write whole pages, so a file copy is
// consistent if done quickly at startup before write traffic begins.
//
// Standalone use:  node backup.mjs

import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data');
const DB_PATH = process.env.DATABASE_PATH || join(DATA_DIR, 'sportscore.db');
const BACKUPS_DIR = join(DATA_DIR, 'backups');
const BACKUPS_TO_KEEP = 10;

export function backupDatabase() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = join(BACKUPS_DIR, `sportscore-${stamp}.db`);
  mkdirSync(BACKUPS_DIR, { recursive: true });
  copyFileSync(DB_PATH, target);

  const files = readdirSync(BACKUPS_DIR)
    .filter((f) => f.startsWith('sportscore-') && f.endsWith('.db'))
    .map((f) => ({ f, mtime: statSync(join(BACKUPS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length > BACKUPS_TO_KEEP) {
    for (const stale of files.slice(BACKUPS_TO_KEEP)) {
      rmSync(join(BACKUPS_DIR, stale.f), { force: true });
    }
  }
  return { target, kept: Math.min(files.length, BACKUPS_TO_KEEP) };
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  const { target } = backupDatabase();
  console.log(`Backup written: ${target}`);
}