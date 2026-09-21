/**
 * scripts/lib/css-blocks.mjs
 * Top-level only CSS block parser & replacer.
 * Ignores nested blocks (e.g. inside @media), ignores braces inside comments and strings.
 * Handles CRLF (\r\n) transparently.
 */

function stripComments(str) {
  return str.replace(/\/\*[\s\S]*?\*\//g, '').trim();
}

export function parseTopLevelBlocks(css) {
  const blocks = [];
  let index = 0;
  const len = css.length;

  let inComment = false;
  let inString = false;
  let stringChar = '';
  let depth = 0;

  let currentSelectorStart = 0;
  let currentBodyStart = -1;
  let topLevelSelector = '';

  while (index < len) {
    const char = css[index];
    const nextChar = index + 1 < len ? css[index + 1] : '';

    // Handle comments
    if (inComment) {
      if (char === '*' && nextChar === '/') {
        inComment = false;
        index += 2;
        continue;
      }
      index++;
      continue;
    }

    if (!inString && char === '/' && nextChar === '*') {
      inComment = true;
      index += 2;
      continue;
    }

    // Handle strings
    if (inString) {
      if (char === '\\') {
        index += 2; // skip escaped char
        continue;
      }
      if (char === stringChar) {
        inString = false;
        stringChar = '';
      }
      index++;
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringChar = char;
      index++;
      continue;
    }

    // Advance selector start on top-level semicolons (e.g. @import ...;)
    if (depth === 0 && char === ';') {
      currentSelectorStart = index + 1;
      index++;
      continue;
    }

    // Top-level brace tracking
    if (char === '{') {
      if (depth === 0) {
        currentBodyStart = index + 1;
        topLevelSelector = stripComments(css.slice(currentSelectorStart, index)).trim();
      }
      depth++;
      index++;
      continue;
    }

    if (char === '}') {
      depth--;
      if (depth === 0 && currentBodyStart !== -1) {
        const bodyEnd = index;
        blocks.push({
          selector: topLevelSelector,
          start: currentSelectorStart,
          end: index + 1,
          bodyStart: currentBodyStart,
          bodyEnd,
          body: css.slice(currentBodyStart, bodyEnd),
        });
        currentBodyStart = -1;
        topLevelSelector = '';
        currentSelectorStart = index + 1;
      }
      index++;
      continue;
    }

    index++;
  }

  return blocks;
}

export function findTopLevelBlock(css, selectorTarget) {
  const blocks = parseTopLevelBlocks(css);
  const target = selectorTarget.trim();

  return blocks.find((b) => {
    const sel = b.selector.trim();
    if (sel === target) return true;
    // Normalize spaces around commas: e.g. ":root, .theme"
    const selParts = sel.split(',').map((p) => p.trim());
    return selParts.includes(target);
  }) || null;
}

export function parseCssDeclarations(blockBody) {
  const declarations = new Map();
  const rawLines = blockBody.split(/\r?\n/);

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('//')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const prop = trimmed.slice(0, colonIdx).trim();
    let val = trimmed.slice(colonIdx + 1).trim();

    if (val.endsWith(';')) {
      val = val.slice(0, -1).trim();
    }

    declarations.set(prop, val);
  }

  return declarations;
}

export function replaceTopLevelBlock(css, selectorTarget, newBody) {
  const block = findTopLevelBlock(css, selectorTarget);
  if (!block) {
    return null;
  }

  // Preserve CRLF if original used CRLF
  const isCrlf = css.includes('\r\n');
  const normalizedNewBody = isCrlf
    ? newBody.replace(/\r?\n/g, '\r\n')
    : newBody.replace(/\r\n/g, '\n');

  const before = css.slice(0, block.bodyStart);
  const after = css.slice(block.bodyEnd);

  return `${before}${normalizedNewBody}${after}`;
}
