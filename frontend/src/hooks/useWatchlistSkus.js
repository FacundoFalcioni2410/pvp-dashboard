import { useEffect, useState } from "react";

const STORAGE_KEY = "pvp-dashboard:watchlist-skus";

function loadStoredSkus() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useWatchlistSkus() {
  const [selectedSkus, setSelectedSkus] = useState(loadStoredSkus);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedSkus));
    } catch {
      // ignore write failures (e.g. storage disabled)
    }
  }, [selectedSkus]);

  return [selectedSkus, setSelectedSkus];
}
