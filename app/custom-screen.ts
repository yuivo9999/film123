export interface CustomScreenConfig {
  enabled: boolean;
  width: number;
  height: number;
  distanceOffset: number;
}

export const DEFAULT_CUSTOM_SCREEN_CONFIG: CustomScreenConfig = {
  enabled: false,
  width: 22,
  height: 12,
  distanceOffset: 0,
};

const STORAGE_KEY = "zuonaar-custom-screen-config";

export function loadCustomScreenConfig(): CustomScreenConfig {
  if (typeof window === "undefined") return DEFAULT_CUSTOM_SCREEN_CONFIG;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        enabled: Boolean(parsed.enabled),
        width: typeof parsed.width === "number" && parsed.width > 0 ? parsed.width : 22,
        height: typeof parsed.height === "number" && parsed.height > 0 ? parsed.height : 12,
        distanceOffset: typeof parsed.distanceOffset === "number" ? parsed.distanceOffset : 0,
      };
    }
  } catch (e) {
    // Ignore storage parse errors
  }
  return DEFAULT_CUSTOM_SCREEN_CONFIG;
}

export function saveCustomScreenConfig(config: CustomScreenConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    // Ignore storage save errors
  }
}
