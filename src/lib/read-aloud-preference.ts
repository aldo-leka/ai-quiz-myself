export const READ_ALOUD_STORAGE_KEY = "quizplus_read_aloud_enabled";

export function readStoredReadAloudPreference(): boolean | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedValue = window.localStorage.getItem(READ_ALOUD_STORAGE_KEY);
  if (storedValue === "1") return true;
  if (storedValue === "0") return false;
  return null;
}

export function writeStoredReadAloudPreference(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(READ_ALOUD_STORAGE_KEY, enabled ? "1" : "0");
}
