import { describe, it, expect } from "vitest";

// Mock the selector processing logic for testing
function mockConsumeSelector(raw: string, prefix: string): { selector: string; rest: string } | null {
  // This is a simplified version of the actual consumeSelector for testing
  // Match attribute selectors including ] inside quoted values: [attr="a]b"]
  const attrRe = /^\[(?:[^"'\[\]]*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))*[^"'\[\]]*\]/;
  const walkSelectorRe = /([([,]|:scope\b)/;
  const scopeRe = /^:scope\b/;

  const startPos = raw.search(/\S/);  // find where actual selector starts
  let i = raw.search(walkSelectorRe);
  if (i === -1) {
    return {
      selector: `${prefix} ${raw}`,
      rest: '',
    };
  } else if (raw[i] === ',') {
    // Extract from startPos to exclude leading whitespace
    const selectorPart = startPos >= 0 && startPos < i ? raw.substring(startPos, i) : raw.substr(0, i);
    return {
      selector: `${prefix} ${selectorPart}`,
      rest: raw.substr(i + 1).trimStart(), // FIX: trim leading whitespace
    };
  }

  let leftmost = true;
  let scope = false;
  i = startPos;

  let depth = 0;
  outer: for (; i < raw.length; ++i) {
    const char = raw[i];
    switch (char) {
      case '[':
        const match = attrRe.exec(raw.substr(i));
        i += (match ? match[0].length : 1) - 1;
        continue;

      case '(':
        ++depth;
        continue;

      case ':':
        if (!leftmost) {
          continue;
        } else if (!scopeRe.test(raw.substr(i))) {
          continue;
        } else if (depth) {
          return null;
        }
        raw = raw.substring(0, i) + prefix + raw.substr(i + 6);
        i += prefix.length;
        scope = true;
        --i;
        continue;

      case ')':
        if (depth) {
          --depth;
        }
        continue;
    }
    if (depth) {
      continue;
    }

    switch (char) {
      case ',':
        break outer;

      case ' ':
      case '>':
      case '~':
      case '+':
        if (!leftmost) {
          continue;
        }
        leftmost = false;
    }
  }

  const selector = (scope ? '' : `${prefix} `) + raw.substring(startPos, i); // FIX: use startPos
  return { selector, rest: raw.substr(i + 1).trimStart() }; // FIX: trim leading whitespace
}

function mockUpdateSelectorText(selectorText: string, prefix: string): string {
  const found = [];
  while (selectorText) {
    const consumed = mockConsumeSelector(selectorText, prefix);
    if (consumed === null) {
      return ':not(*)';
    }
    found.push(consumed.selector);
    selectorText = consumed.rest;
  }
  return found.join(', ');
}

describe('Scoped styles polyfill fixes', () => {
  const prefix = '[__scoped_1]';

  it('should handle simple comma-separated selectors', () => {
    const input = '.foo, .bar';
    const result = mockUpdateSelectorText(input, prefix);
    expect(result).toBe(`${prefix} .foo, ${prefix} .bar`);
    expect(result).not.toContain('  '); // No double spaces
  });

  it('should handle comma-separated selectors with attribute selectors', () => {
    const input = '.foo[attr], .bar[attr]';
    const result = mockUpdateSelectorText(input, prefix);
    expect(result).toBe(`${prefix} .foo[attr], ${prefix} .bar[attr]`);
    expect(result).not.toContain('  '); // No double spaces
  });

  it('should handle multiple attribute selectors in comma-separated list', () => {
    const input = '[attr1], [attr2], [attr3]';
    const result = mockUpdateSelectorText(input, prefix);
    expect(result).toBe(`${prefix} [attr1], ${prefix} [attr2], ${prefix} [attr3]`);
    expect(result).not.toContain('  '); // No double spaces
  });

  it('should handle complex selectors from SimpleCheckboxQuiz.css', () => {
    const input = `.bloom-editable.QuizHeader-style[contentEditable="true"][data-languageTipContent]:not([data-languageTipContent=""]):after, .bloom-editable.QuizAnswer-style[contentEditable="true"][data-languageTipContent]:not([data-languageTipContent=""]):after`;
    const result = mockUpdateSelectorText(input, prefix);

    // Should contain both selectors
    expect(result).toContain('.bloom-editable.QuizHeader-style');
    expect(result).toContain('.bloom-editable.QuizAnswer-style');

    // Should have the prefix in the result
    expect(result).toContain('[__scoped_1]');

    // Most importantly: should not have double spaces (the main bug fix)
    expect(result).not.toContain('  ');
  });

  it('should handle mixed selectors with and without attribute selectors', () => {
    const input = '.foo, [attr], .bar[data-test]';
    const result = mockUpdateSelectorText(input, prefix);
    expect(result).toBe(`${prefix} .foo, ${prefix} [attr], ${prefix} .bar[data-test]`);
    expect(result).not.toContain('  '); // No double spaces
  });

  it('should handle selectors with spaces after commas', () => {
    const input = '.foo , .bar , .baz';
    const result = mockUpdateSelectorText(input, prefix);
    // The trimStart removes leading spaces, but spaces around the comma in the original
    // will be preserved as part of the selector text
    const parts = result.split(', ');
    expect(parts.length).toBe(3);

    // Most importantly: should not have double spaces
    expect(result).not.toContain('  ');
  });

  it('should handle :where() pseudo-selector with attribute selectors (BL issue)', () => {
    // This is the exact problematic selector from the user
    const input = `.numberedPage:where([class*="Ebook"]:not(.bloom-interactive-page)),
.numberedPage:where([class*="Device"]:not(.bloom-interactive-page))`;
    const result = mockUpdateSelectorText(input, prefix);

    // Both selectors should be present
    expect(result).toContain('.numberedPage:where([class*="Ebook"]');
    expect(result).toContain('.numberedPage:where([class*="Device"]');

    // Both should get the prefix
    const prefixCount = (result.match(/\[__scoped_1\]/g) || []).length;
    expect(prefixCount).toBe(2);

    // Should not have double spaces
    expect(result).not.toContain('  ');

    // Should not be invalid
    expect(result).not.toBe(':not(*)');
  });

  it('should handle selectors starting with attribute selectors (critical bug)', () => {
    // This matches the exact real-world problem from the user's book
    const input = `[class*="Ebook"].numberedPage:not(.bloom-interactive-page), [class*="Device"].numberedPage:not(.bloom-interactive-page)`;
    const result = mockUpdateSelectorText(input, prefix);

    // Both should be present
    expect(result).toContain('Ebook');
    expect(result).toContain('Device');

    // CRITICAL: Both must have the prefix
    const parts = result.split(', ');
    expect(parts.length).toBe(2);
    parts.forEach((part) => {
      const prefixPresent = part.includes('[__scoped_1]');
      expect(prefixPresent).toBe(true);
    });

    // No double spaces
    expect(result).not.toContain('  ');
  });

  it('should handle user-reported case with ::after pseudo-element', () => {
    // This is the exact case the user found where commas were not being detected
    const input = `.numberedPage[class*="Ebook"]::after, .numberedPage[class*="Device"]::after, .bloomPlayer-page .numberedPage::after`;
    const result = mockUpdateSelectorText(input, prefix);

    // Should have THREE selectors separated by commas, each with the prefix
    const parts = result.split(', ');
    expect(parts.length).toBe(3);
    parts.forEach((part) => {
      const prefixPresent = part.includes('[__scoped_1]');
      expect(prefixPresent).toBe(true);
    });
  });

  it('should handle ] character inside quoted attribute values', () => {
    // Ensure ] inside quotes doesn't break attribute matching
    const input = `[data-content="some]value"], [data-other="test"]`;
    const result = mockUpdateSelectorText(input, prefix);

    // Should have TWO selectors, both with prefix
    const parts = result.split(', ');
    expect(parts.length).toBe(2);
    expect(parts[0]).toBe(`${prefix} [data-content="some]value"]`);
    expect(parts[1]).toBe(`${prefix} [data-other="test"]`);
  });
});
