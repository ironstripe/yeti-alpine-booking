// Early source alarm only; tests/productModalScroll.py verifies actual browser scrolling.
// No browser, packages, network, or application data required.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../src/components/settings/ProductFormModal.tsx', import.meta.url), 'utf8');

function classesFor(sourceText, tag) {
  const match = sourceText.match(new RegExp(`<${tag}\\b[^>]*\\bclassName="([^"]*)"[^>]*>`));
  assert.ok(match, `${tag} must have an explicit layout className`);
  return new Set(match[1].split(/\s+/));
}

function requireClasses(classes, expected, label) {
  for (const name of expected) assert.ok(classes.has(name), `${label} must retain ${name}`);
}

function viewportConstraint(classes, prefix) {
  return [...classes].some((name) => {
    if (!name.startsWith(`${prefix}-[`)) return false;
    const heights = [...name.matchAll(/(\d+(?:\.\d+)?)(?:dvh|vh)\b/g)];
    return heights.length > 0 && heights.every((match) => Number(match[1]) > 0 && Number(match[1]) <= 100);
  });
}

test('dialog has definite viewport-constrained height and a shrinking flex column', () => {
  const classes = classesFor(source, 'DialogContent');
  assert.ok(viewportConstraint(classes, 'h'), 'max-height alone is insufficient: retain a definite viewport height');
  assert.ok(viewportConstraint(classes, 'max-h'), 'retain the viewport-safe maximum height');
  requireClasses(classes, ['flex', 'flex-col', 'min-h-0', 'overflow-hidden'], 'DialogContent');
});

test('middle pane is the native shrinking scroll container between header and footer', () => {
  const match = source.match(/<\/DialogHeader>\s*<div\b[^>]*className="([^"]*)"[^>]*>/);
  assert.ok(match, 'native middle pane must immediately follow the fixed header');
  requireClasses(new Set(match[1].split(/\s+/)), ['min-h-0', 'flex-1', 'overflow-y-scroll', 'overscroll-contain', '[scrollbar-gutter:stable]', '[&::-webkit-scrollbar]:w-2', '[&::-webkit-scrollbar-thumb]:bg-border'], 'middle pane');
  assert.match(match[0], /tabIndex=\{0\}/, 'scroll pane must be keyboard focusable');
  assert.ok(source.indexOf('<DialogFooter') > match.index, 'footer must follow the scroll pane');
});

test('header and footer cannot shrink away', () => {
  requireClasses(classesFor(source, 'DialogHeader'), ['shrink-0'], 'header');
  requireClasses(classesFor(source, 'DialogFooter'), ['shrink-0'], 'footer');
});

test('product modal never returns to Radix ScrollArea', () => {
  assert.doesNotMatch(source, /\bScrollArea\b|\bScrollAreaPrimitive\b|@radix-ui\/react-scroll-area|\/ui\/scroll-area/);
});

test('height alarm rejects the original max-height-only regression', () => {
  const classes = classesFor(source, 'DialogContent');
  const withoutDefiniteHeight = new Set([...classes].filter((name) => !name.startsWith('h-')));
  assert.equal(viewportConstraint(withoutDefiniteHeight, 'h'), false);
  assert.equal(viewportConstraint(withoutDefiniteHeight, 'max-h'), true);
});