/*
 * Copyright 2017 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

/**
 * @fileoverview Pure selector-rewriting logic for the `<style scoped>` polyfill.
 *
 * This was extracted from scoped-styles-polyfill.js so it can be unit-tested
 * directly (see scoped-styles-polyfill.test.ts) rather than against a duplicated
 * copy that could silently drift from what actually ships. These functions are
 * pure string transforms and touch no DOM, so they import cleanly into tests.
 */

// This matches any valid `[foo="bar"]` block, with either quote style. The regex explicitly
// handles quoted content to allow \" or \' in string parts (e.g. `[foo="b\"ar"]`) and
// allows ] inside quoted values (e.g. `[attr="a]b"]`).
//
// FIX: The original regex had a greedy `.*` after quoted values that could match across
// multiple attribute selectors, breaking comma-separated lists. Now we explicitly match:
// 1. Unquoted content (no brackets or quotes)
// 2. Quoted strings (allowing ] and escaped quotes inside)
// 3. Repeat as needed
// 4. Final unquoted content (no brackets)
// This ensures we stop at the ] of THIS attribute only, not consume across commas.
const attrRe = /^\[(?:[^"'\[\]]*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))*[^"'\[\]]*\]/;
const walkSelectorRe = /([([,]|:scope\b)/;  // "interesting" setups
const scopeRe = /^:scope\b/;

/**
 * Consumes a single selector from candidate selector text, which may contain many.
 *
 * @param {string} raw selector text
 * @param {string} prefix to apply
 * @return {?{selector: string, rest: string}}
 */
export function consumeSelector(raw, prefix) {
  const startPos = raw.search(/\S/);  // find where actual selector starts (skip leading whitespace)
  let i = raw.search(walkSelectorRe);
  if (i === -1) {
    // found literally nothing interesting, success
    return {
      selector: `${prefix} ${raw}`,
      rest: '',
    };
  } else if (raw[i] === ',') {
    // found comma without anything interesting, yield rest
    // Extract from startPos to exclude leading whitespace
    const selectorPart = startPos >= 0 && startPos < i ? raw.substring(startPos, i) : raw.substr(0, i);
    return {
      selector: `${prefix} ${selectorPart}`,
      rest: raw.substr(i + 1).trimStart(),
    }
  }

  let leftmost = true;   // whether we're past a descendant or similar selector
  let scope = false;     // whether :scope has been found + replaced
  i = startPos;

  let depth = 0;
outer:
  for (; i < raw.length; ++i) {
    const char = raw[i];
    switch (char) {
      case '[':
        const match = attrRe.exec(raw.substr(i));
        i += (match ? match[0].length : 1) - 1;  // we add 1 every loop
        continue;

      case '(':
        ++depth;
        continue;

      case ':':
        if (!leftmost) {
          continue;  // doesn't matter if :scope is here, it'll always be ignored
        } else if (!scopeRe.test(raw.substr(i))) {
          continue;  // not ':scope', ignore
        } else if (depth) {
          return null;
        }

        // Replace ':scope' with our prefix. This can happen many times; ':scope:scope' is valid.
        // It will never apply to a descendant selector (e.g., ".foo :scope") as this is ignored
        // by browsers anyway (invalid).
        raw = raw.substring(0, i) + prefix + raw.substr(i + 6);
        i += prefix.length;
        scope = true;
        --i;  // we'd skip over next character otherwise
        continue;  // run loop again

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

  const selector = (scope ? '' : `${prefix} `) + raw.substring(startPos, i);
  return {selector, rest: raw.substr(i + 1).trimStart()};
}

/**
 * Rewrites a full (possibly comma-separated) selector list to be scoped under prefix.
 *
 * @param {string} selectorText the full selector text of a CSS rule
 * @param {string} prefix to apply
 * @return {string}
 */
export function updateSelectorText(selectorText, prefix) {
  const found = [];

  while (selectorText) {
    const consumed = consumeSelector(selectorText, prefix);
    if (consumed === null) {
      return ':not(*)';
    }
    found.push(consumed.selector);
    selectorText = consumed.rest;
  }

  return found.join(', ');
}
