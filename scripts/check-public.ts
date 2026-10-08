// Fails when anything headed for this public repo contains a denied word.
//   --staged          staged files (pre-commit hook)
//   --message <file>  a commit message (commit-msg hook)
//   --all             every tracked file (CI)
//   --log [<range>]   commit messages (CI; all history by default)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { DENIED } from './denylist.ts';
import { findDenied } from './public-guard.ts';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
const lines = (s: string) => s.split('\n').filter(Boolean);

function sources(mode: string | undefined, arg: string | undefined): Array<[name: string, text: string]> {
  switch (mode) {
    case '--staged':
      return lines(git('diff', '--cached', '--name-only', '--diff-filter=ACMR')).map(path => [path, `${path}\n${git('show', `:${path}`)}`]);
    case '--all':
      return lines(git('ls-files')).map(path => [path, `${path}\n${readFileSync(path, 'utf8')}`]);
    case '--message':
      if (!arg) throw new Error('--message needs a file');
      return [['commit message', readFileSync(arg, 'utf8')]];
    case '--log':
      return lines(git('log', '--format=%H', ...(arg ? [arg] : []))).map(sha => [`commit ${sha.slice(0, 7)}`, git('log', '-1', '--format=%B', sha)]);
    default:
      throw new Error('usage: check-public.ts --staged | --message <file> | --all | --log [<range>]');
  }
}

const [mode, arg] = process.argv.slice(2);
let failed = false;
for (const [name, text] of sources(mode, arg)) {
  if (text.includes('\0')) continue; // binary
  const found = findDenied(text, DENIED);
  if (found.length) {
    failed = true;
    console.error(`${name}: contains ${found.map(w => `"${w}"`).join(', ')}`);
  }
}
if (failed) {
  console.error('\nThis repo is public: keep customer, team, brand and vendor names and other internal words out of it.');
  process.exit(1);
}
