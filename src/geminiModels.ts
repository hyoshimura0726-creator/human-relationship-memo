/**
 * Google AI Studio のモデル一覧に対応する、Gemini Developer API 用モデル ID。
 * UI の「Preview」表記は REST では別名のため、ここでは公式ドキュメントの安定 ID を使う。
 */

export const GEMINI_FLASH_PRESETS: {label: string; id: string}[] = [
  {label: 'Gemini Flash (最新)', id: 'gemini-2.5-flash'},
  {label: 'Gemini Flash Lite (最新)', id: 'gemini-2.5-flash-lite'},
  {label: 'Gemini 1.5 Flash', id: 'gemini-1.5-flash'},
  {label: 'Gemini 1.5 Flash Lite Preview 相当', id: 'gemini-1.5-flash-8b'},
];

export const GEMINI_PRO_PRESETS: {label: string; id: string}[] = [
  {label: 'Gemini Pro (最新)', id: 'gemini-2.5-pro'},
  {label: 'Gemini 1.5 Pro', id: 'gemini-1.5-pro'},
];

export const LS_GEMINI_FLASH_MODEL = 'relationship_keeper_gemini_flash_model_id';
export const LS_GEMINI_PRO_MODEL = 'relationship_keeper_gemini_pro_model_id';

const readEnv = (key: string): string => {
  const im = (import.meta as {env?: Record<string, string | undefined>}).env ?? {};
  return (im[key] ?? process.env[key] ?? '').trim();
};

export const getDefaultFlashModelId = (): string => {
  const fromEnv =
    readEnv('GEMINI_FLASH_MODEL') || readEnv('VITE_GEMINI_FLASH_MODEL');
  if (fromEnv) return fromEnv;
  return 'gemini-2.5-flash';
};

export const getDefaultProModelId = (): string => {
  const fromEnv = readEnv('GEMINI_PRO_MODEL') || readEnv('VITE_GEMINI_PRO_MODEL');
  if (fromEnv) return fromEnv;
  return 'gemini-2.5-pro';
};

const isKnownFlashId = (id: string): boolean =>
  GEMINI_FLASH_PRESETS.some((p) => p.id === id);

const isKnownProId = (id: string): boolean =>
  GEMINI_PRO_PRESETS.some((p) => p.id === id);

export const loadFlashModelId = (): string => {
  const fallback = getDefaultFlashModelId();
  try {
    const s = localStorage.getItem(LS_GEMINI_FLASH_MODEL);
    if (s && isKnownFlashId(s)) return s;
  } catch {
    /* ignore */
  }
  return fallback;
};

export const loadProModelId = (): string => {
  const fallback = getDefaultProModelId();
  try {
    const s = localStorage.getItem(LS_GEMINI_PRO_MODEL);
    if (s && isKnownProId(s)) return s;
  } catch {
    /* ignore */
  }
  return fallback;
};
