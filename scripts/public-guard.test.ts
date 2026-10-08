import { describe, expect, it } from 'vitest';
import { findDenied, fingerprint } from './public-guard.ts';

// Stand-in words: the real denylist only exists as fingerprints.
const denied = [fingerprint('zorblax'), fingerprint('quill finch')];

describe('findDenied', () => {
  it('finds a denied word regardless of case or punctuation', () => {
    expect(findDenied('// Ported from the ZORBLAX sheet.', denied)).toEqual(['zorblax']);
  });

  it('finds a denied two-word phrase split across punctuation', () => {
    expect(findDenied('const quill_finch = 1', denied)).toEqual(['quill finch']);
  });

  it('ignores words that only contain a denied word', () => {
    expect(findDenied('zorblaxes and quill, then later finch', denied)).toEqual([]);
  });

  it('reports each denied phrase once', () => {
    expect(findDenied('zorblax zorblax', denied)).toEqual(['zorblax']);
  });
});
