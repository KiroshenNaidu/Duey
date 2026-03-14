import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { openDB, DBSchema, IDBPDatabase } from 'idb';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number) {
  const formatted = new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(amount);
  
  // Add a space if it's missing after 'R'
  if (formatted.startsWith('R') && !formatted.startsWith('R ')) {
      return `R ${formatted.substring(1)}`;
  }
  return formatted;
}

export function hexToHsl(hex: string): string | null {
  if (!hex || (hex.length !== 4 && hex.length !== 7)) return null;
  
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) { // #RGB
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else { // #RRGGBB
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  }

  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  h = Math.round(h * 360);
  s = Math.round(s * 100);
  l = Math.round(l * 100);

  return `${h} ${s}% ${l}%`;
}


export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (0 <= h && h < 60) { [r, g, b] = [c, x, 0]; } 
  else if (60 <= h && h < 120) { [r, g, b] = [x, c, 0]; } 
  else if (120 <= h && h < 180) { [r, g, b] = [0, c, x]; } 
  else if (180 <= h && h < 240) { [r, g, b] = [0, x, c]; } 
  else if (240 <= h && h < 300) { [r, g, b] = [x, 0, c]; } 
  else if (300 <= h && h < 360) { [r, g, b] = [c, 0, x]; }

  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// --- IndexedDB Key-Value Store ---
const DB_NAME = 'AppDataStore';
const DB_VERSION = 1;
const STORE_NAME = 'KeyValueStore';

interface MyDB extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: any;
  };
}

let dbPromise: Promise<IDBPDatabase<MyDB>> | null = null;

function getDb(): Promise<IDBPDatabase<MyDB>> {
  if (typeof window === 'undefined') {
    return Promise.reject('IndexedDB cannot be used in SSR.');
  }
  if (!dbPromise) {
    dbPromise = openDB<MyDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME);
      },
    });
  }
  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await getDb();
    return db.get(STORE_NAME, key);
  } catch (error) {
    console.error('Failed to get from IndexedDB', error);
    return undefined;
  }
}

export async function idbSet(key: string, value: any): Promise<void> {
   try {
    const db = await getDb();
    await db.put(STORE_NAME, value, key);
  } catch (error) {
    console.error('Failed to set in IndexedDB', error);
  }
}

export async function idbClear(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear(STORE_NAME);
  } catch (error) {
    console.error('Failed to clear IndexedDB', error);
  }
}
