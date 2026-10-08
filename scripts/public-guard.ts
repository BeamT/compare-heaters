import { createHash } from 'node:crypto';

/**
 * This repo is public, so the words it must never contain can't be listed in
 * it either. The denylist holds SHA-256 fingerprints of lowercased words and
 * two-word phrases instead; text is checked by fingerprinting every word and
 * every pair of adjacent words in it.
 */
export function fingerprint(phrase: string): string {
  return createHash('sha256').update(phrase.toLowerCase()).digest('hex');
}

/** The denied phrases found in `text`, each once, in order of appearance. */
export function findDenied(text: string, denied: readonly string[]): string[] {
  const deniedSet = new Set(denied);
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const found = new Set<string>();
  words.forEach((word, i) => {
    const pair = i + 1 < words.length ? `${word} ${words[i + 1]}` : undefined;
    for (const phrase of pair ? [word, pair] : [word]) {
      if (deniedSet.has(fingerprint(phrase))) found.add(phrase);
    }
  });
  return [...found];
}
