export type Settings = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  defaultAccent: string;
  shell: string;
};

export declare const FONT_SIZE_MIN: number;
export declare const FONT_SIZE_MAX: number;
export declare const DEFAULT_FONT_SIZE: number;
export declare const DEFAULT_LINE_HEIGHT: number;
export declare const DEFAULT_FONT_FAMILY: string;
export declare function clampFontSize(n: number): number;
export declare function defaultSettings(defaultShell: string): Settings;
export declare function normalizeSettings(
  raw: unknown,
  defaultShell: string
): Settings;
