import type { PersistedState } from "../src/types";

export type LoadResult = {
  state: PersistedState | null;
  source: "v2" | "migrated" | "fresh";
  backupPath: string | null;
  backupFailed: boolean;
  backupKind: "v1-backup" | "bad" | null;
  raw: string | null;
};

export declare function writeBackup(
  filePath: string,
  raw: string,
  kind: string
): string;
export declare function writeStateFile(
  filePath: string,
  doc: unknown,
  pretty?: boolean
): void;
export declare function loadStateFile(
  filePath: string,
  defaultAccent?: string
): LoadResult;
