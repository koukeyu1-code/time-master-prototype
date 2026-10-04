import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../src/', import.meta.url));
async function jsxFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await jsxFiles(file));
    else if (entry.name.endsWith('.jsx')) files.push(file);
  }
  return files;
}

test('explicit SVG width/height attributes do not use the CSS auto keyword', async () => {
  let checked = 0;
  for (const file of await jsxFiles(src)) {
    const source = await readFile(file, 'utf8');
    // A source-level guard for explicit JSX attributes, not a browser renderer.
    // auto remains valid in CSS height and in the marker orient attribute.
    for (const [tag] of source.matchAll(/<(?:svg|rect|image|foreignObject|pattern|marker|filter|mask|use)\b[^>]*>/g)) {
      checked += 1;
      assert.doesNotMatch(tag, /\s(?:width|height)\s*=\s*(?:["']auto["']|\{\s*["']auto["']\s*\})/,
        `Use CSS for automatic SVG dimensions: ${path.relative(src, file)}`);
    }
  }
  assert.ok(checked > 0, 'The source guard must inspect SVG elements');
});

test('route map keeps its responsive CSS and intrinsic viewBox', async () => {
  const source = await readFile(path.join(src, 'pages/TripsPage.jsx'), 'utf8');
  const tag = [...source.matchAll(/<svg\b[^>]*>/g)].map(match => match[0])
    .find(value => value.includes('className="tr-routemap-svg"'));
  assert.ok(tag, 'Route map SVG must exist');
  assert.match(tag, /\bviewBox=/);
  assert.doesNotMatch(tag, /\sheight\s*=/, 'CSS controls the route map height');
  const css = await readFile(path.join(src, 'pages/TripsPage.css'), 'utf8');
  const rule = css.match(/\.tr-routemap-svg\s*\{([^}]*)\}/)?.[1];
  assert.ok(rule, 'Route map responsive CSS must exist');
  assert.match(rule, /(?:^|;)\s*width\s*:\s*100%\s*(?:;|$)/);
  assert.match(rule, /(?:^|;)\s*height\s*:\s*auto\s*(?:;|$)/);
});
