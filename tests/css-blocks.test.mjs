import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTopLevelBlocks,
  findTopLevelBlock,
  parseCssDeclarations,
  replaceTopLevelBlock,
} from '../scripts/lib/css-blocks.mjs';

test('F3.1: parses standard top-level blocks like :root, .dark, @theme inline', () => {
  const css = `
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #000000;
}

.dark {
  --background: #000000;
  --foreground: #ffffff;
}

@theme inline {
  --color-brand: #3b82f6;
}
`;

  const blocks = parseTopLevelBlocks(css);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].selector, ':root');
  assert.equal(blocks[1].selector, '.dark');
  assert.equal(blocks[2].selector, '@theme inline');

  const rootBlock = findTopLevelBlock(css, ':root');
  assert.ok(rootBlock);
  assert.ok(rootBlock.body.includes('--background: #ffffff;'));

  const decls = parseCssDeclarations(rootBlock.body);
  assert.equal(decls.get('--background'), '#ffffff');
  assert.equal(decls.get('--foreground'), '#000000');
});

test('F3.1: ignores nested blocks inside @media', () => {
  const css = `
:root {
  --color: red;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color: blue;
  }
  .dark {
    --color: navy;
  }
}

.dark {
  --color: black;
}
`;

  const blocks = parseTopLevelBlocks(css);
  // Top-level blocks should be: :root, @media (...), and .dark
  const selectors = blocks.map((b) => b.selector);
  assert.ok(selectors.includes(':root'));
  assert.ok(selectors.includes('@media (prefers-color-scheme: dark)'));
  assert.ok(selectors.includes('.dark'));

  // findTopLevelBlock(':root') must find the top-level :root, not the one in @media
  const rootBlock = findTopLevelBlock(css, ':root');
  assert.ok(rootBlock);
  assert.ok(rootBlock.body.includes('--color: red;'));
  assert.ok(!rootBlock.body.includes('--color: blue;'));
});

test('F3.1: handles curly braces inside comments properly', () => {
  const css = `
/* A comment containing { and } braces to throw off naive parsers */
:root {
  /* another { comment } here */
  --primary: purple;
}
/* closing brace comment } */
.dark {
  --primary: lavender;
}
`;

  const blocks = parseTopLevelBlocks(css);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].selector, ':root');
  assert.equal(blocks[1].selector, '.dark');

  const decls = parseCssDeclarations(blocks[0].body);
  assert.equal(decls.get('--primary'), 'purple');
});

test('F3.1: handles curly braces inside strings properly', () => {
  const css = `
.icon:after {
  content: "}";
}

:root {
  --symbol: "{";
  --bg: white;
}
`;

  const blocks = parseTopLevelBlocks(css);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].selector, '.icon:after');
  assert.equal(blocks[1].selector, ':root');

  const rootBlock = findTopLevelBlock(css, ':root');
  assert.ok(rootBlock);
  const decls = parseCssDeclarations(rootBlock.body);
  assert.equal(decls.get('--symbol'), '"{"');
  assert.equal(decls.get('--bg'), 'white');
});

test('F3.1: handles CRLF line endings transparently', () => {
  const crlfCss = ':root {\r\n  --test: 123;\r\n}\r\n\r\n.dark {\r\n  --test: 456;\r\n}\r\n';
  const blocks = parseTopLevelBlocks(crlfCss);

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].selector, ':root');
  assert.equal(blocks[1].selector, '.dark');

  const newBody = '\r\n  --test: 999;\r\n';
  const replaced = replaceTopLevelBlock(crlfCss, ':root', newBody);
  assert.ok(replaced.includes('\r\n'));
  assert.ok(replaced.includes('--test: 999;'));
  assert.ok(replaced.includes('.dark {\r\n  --test: 456;\r\n}'));

  // Verify CRLF normalization when replacing with LF string
  const replacedWithLf = replaceTopLevelBlock(crlfCss, ':root', '\n  --test: 777;\n');
  assert.ok(replacedWithLf.includes('\r\n  --test: 777;\r\n'));
});

test('F3.1: replaceTopLevelBlock replaces exact block body and returns null if not found', () => {
  const css = `
:root {
  --bg: #fff;
}

.dark {
  --bg: #000;
}
`;

  const replaced = replaceTopLevelBlock(css, ':root', '\n  --bg: #fafafa;\n  --fg: #111;\n');
  assert.ok(replaced);
  assert.ok(replaced.includes('--bg: #fafafa;'));
  assert.ok(replaced.includes('.dark {'));

  const notFound = replaceTopLevelBlock(css, '.nonexistent', 'body');
  assert.equal(notFound, null);
});
