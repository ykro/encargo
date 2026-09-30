"use client";
// The bag lives in this browser only (localStorage). It holds opaque references
// and the size the person picked — nothing a crawler of the store could read.
import { useEffect, useState } from "react";

export interface BagLine {
  ref: string;
  size: string;
}

const KEY = "pulso.bolsa";
const EVENT = "pulso-bag";

export function readBag(): BagLine[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as BagLine[];
  } catch {
    return [];
  }
}

export function writeBag(lines: BagLine[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* private mode: the bag simply does not persist */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function addToBag(line: BagLine): void {
  writeBag([...readBag().filter((l) => !(l.ref === line.ref && l.size === line.size)), line]);
}

export const bagCount = (lines: BagLine[]) => lines.length;

export function useBag(): BagLine[] {
  const [lines, setLines] = useState<BagLine[]>([]);
  useEffect(() => {
    const sync = () => setLines(readBag());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return lines;
}
