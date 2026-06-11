// State-file I/O: the B3 load decision table (with timestamped backups
// written BEFORE anything else may touch the file) and the hardened write
// path (fsync before the atomic temp-file rename). Plain node — no electron —
// so scripts/test-migration.mjs exercises the exact production code path.

import fs from "node:fs";
import path from "node:path";
import { DEFAULT_ACCENT, migrateV1toV2, validateV1, validateV2 } from "./state-schema.mjs";

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function writeFileWithFsync(filePath, contents) {
  const fd = fs.openSync(filePath, "w");
  try {
    fs.writeFileSync(fd, contents);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

// Byte-identical copy of the original file, e.g. state.json.v1-backup-<ts>.
export function writeBackup(filePath, raw, kind) {
  const backupPath = `${filePath}.${kind}-${timestamp()}`;
  writeFileWithFsync(backupPath, raw);
  return backupPath;
}

// Atomic save: temp file + fsync + rename (B3 write hardening). settings.json
// shares this path with pretty=true since it doubles as a hand-edited config
// file (C3 escape hatch).
export function writeStateFile(filePath, doc, pretty = false) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + ".tmp";
  writeFileWithFsync(tmp, JSON.stringify(doc, null, pretty ? 2 : undefined));
  fs.renameSync(tmp, filePath);
}

// B3 load decision table. Returns the hydration payload plus what happened:
//   v2 valid            → { state, source: "v2" }                (no backup)
//   v1 valid            → { state: migrated, source: "migrated", backupPath }
//   v1 invalid / other  → { state: null, source: "fresh", backupPath (.bad-) }
//   unparseable JSON    → { state: null, source: "fresh", backupPath (.bad-) }
//   file absent         → { state: null, source: "fresh" }       (no backup)
// A failed backup write sets backupFailed and aborts the migration — the
// caller must suppress saves until a backup succeeds (raw carries the
// original file contents for the retry).
export function loadStateFile(filePath, defaultAccent = DEFAULT_ACCENT) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return { state: null, source: "fresh", backupPath: null, backupFailed: false, backupKind: null, raw: null };
  }

  let parsed = null;
  let parseOk = true;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parseOk = false;
  }

  if (parseOk && validateV2(parsed)) {
    return { state: parsed, source: "v2", backupPath: null, backupFailed: false, backupKind: null, raw };
  }

  if (parseOk && parsed && parsed.version === 1 && validateV1(parsed)) {
    let backupPath;
    try {
      backupPath = writeBackup(filePath, raw, "v1-backup");
    } catch {
      return { state: null, source: "fresh", backupPath: null, backupFailed: true, backupKind: "v1-backup", raw };
    }
    return {
      state: migrateV1toV2(parsed, defaultAccent),
      source: "migrated",
      backupPath,
      backupFailed: false,
      backupKind: "v1-backup",
      raw,
    };
  }

  let backupPath = null;
  let backupFailed = false;
  try {
    backupPath = writeBackup(filePath, raw, "bad");
  } catch {
    backupFailed = true;
  }
  return { state: null, source: "fresh", backupPath, backupFailed, backupKind: "bad", raw };
}
