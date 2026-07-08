import { describe, it, expect } from "vitest";
// Import the ACTUAL production logic, so these tests exercise the code that ships
// (rather than a duplicated copy that could silently drift out of sync).
import { updateSelectorText } from "./scoped-styles-selectors.js";

describe('Scoped styles polyfill fixes', () => {
  const prefix = '[__scoped_1]';

  it('should handle simple comma-separated selectors', () => {
    const input = '.foo, .bar';
    const result = updateSelectorText(input, prefix);
    expect(result).toBe(`${prefix} .foo, ${prefix} .bar`);
    expect(result).not.toContain('  '); // No double spaces
  });

  it('should handle comma-separated selectors with attribute selectors', () => {
    const input = '.foo[attr], .bar[attr]';
    const result = updateSelectorText(input, prefix);
    expect(result).toBe(`${prefix} .foo[attr], ${prefix} .bar[attr]`);
    expect(result).not.toContain('  '); // No double spaces
  });

  it('should handle multiple attribute selectors in comma-separated list', () => {
    const input = '[attr1], [attr2], [attr3]';
    const result = updateSelectorText(input, prefix);
    expect(result).toBe(`${prefix} [attr1], ${prefix} [attr2], ${prefix} [attr3]`);
    expect(result).not.toContain('  '); // No double spaces
  });

  it('should handle complex selectors from SimpleCheckboxQuiz.css', () => {
    const input = `.bloom-editable.QuizHeader-style[contentEditable="true"][data-languageTipContent]:not([data-languageTipContent=""]):after, .bloom-editable.QuizAnswer-style[contentEditable="true"][data-languageTipContent]:not([data-languageTipContent=""]):after`;
    const result = updateSelectorText(input, prefix);

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
    const result = updateSelectorText(input, prefix);
    expect(result).toBe(`${prefix} .foo, ${prefix} [attr], ${prefix} .bar[data-test]`);
    expect(result).not.toContain('  '); // No double spaces
  });

  it('should handle selectors with spaces after commas', () => {
    const input = '.foo , .bar , .baz';
    const result = updateSelectorText(input, prefix);
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
    const result = updateSelectorText(input, prefix);

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
    const result = updateSelectorText(input, prefix);

    // Both should be present
    expect(result).toContain('Ebook');
    expect(result).toContain('Device');

    // CRITICAL: Both must have the prefix
    const parts = result.split(', ');
    expect(parts.length).toBe(2);
    parts.forEach((part: string) => {
      const prefixPresent = part.includes('[__scoped_1]');
      expect(prefixPresent).toBe(true);
    });

    // No double spaces
    expect(result).not.toContain('  ');
  });

  it('should handle user-reported case with ::after pseudo-element', () => {
    // This is the exact case the user found where commas were not being detected
    const input = `.numberedPage[class*="Ebook"]::after, .numberedPage[class*="Device"]::after, .bloomPlayer-page .numberedPage::after`;
    const result = updateSelectorText(input, prefix);

    // Should have THREE selectors separated by commas, each with the prefix
    const parts = result.split(', ');
    expect(parts.length).toBe(3);
    parts.forEach((part: string) => {
      const prefixPresent = part.includes('[__scoped_1]');
      expect(prefixPresent).toBe(true);
    });
  });

  it('should handle ] character inside quoted attribute values', () => {
    // Ensure ] inside quotes doesn't break attribute matching
    const input = `[data-content="some]value"], [data-other="test"]`;
    const result = updateSelectorText(input, prefix);

    // Should have TWO selectors, both with prefix
    const parts = result.split(', ');
    expect(parts.length).toBe(2);
    expect(parts[0]).toBe(`${prefix} [data-content="some]value"]`);
    expect(parts[1]).toBe(`${prefix} [data-other="test"]`);
  });
});
