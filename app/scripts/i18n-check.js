#!/usr/bin/env node
// i18n check (CLAUDE.md §4): en.json and he.json must have exactly the same keys, every value must be a
// non-empty string, and {{placeholders}} must match between languages. Hardcoded JSX strings are caught
// separately by the i18next/no-literal-string lint rule.
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const LANGUAGES = ['en', 'he'];

function flatten(obj, prefix = '') {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value))
      Object.assign(acc, flatten(value, full));
    else acc[full] = value;
    return acc;
  }, {});
}

const placeholders = (s) =>
  [...s.matchAll(/{{\s*(\w+)\s*}}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

function check(locales) {
  const errors = [];
  const flat = Object.fromEntries(
    Object.entries(locales).map(([lang, obj]) => [lang, flatten(obj)]),
  );
  const allKeys = new Set(Object.values(flat).flatMap((f) => Object.keys(f)));
  for (const key of [...allKeys].sort()) {
    for (const lang of Object.keys(flat)) {
      const value = flat[lang][key];
      if (value === undefined) errors.push(`${lang}.json is missing "${key}"`);
      else if (typeof value !== 'string' || value.trim() === '')
        errors.push(`${lang}.json "${key}" must be a non-empty string`);
    }
    const sets = Object.keys(flat)
      .filter((lang) => typeof flat[lang][key] === 'string')
      .map((lang) => [lang, placeholders(flat[lang][key])]);
    if (new Set(sets.map(([, p]) => p)).size > 1) {
      errors.push(
        `"${key}" has different placeholders: ${sets.map(([l, p]) => `${l}=[${p}]`).join(' ')}`,
      );
    }
  }
  return { errors, keyCount: allKeys.size };
}

module.exports = { check, flatten };

if (require.main === module) {
  const locales = Object.fromEntries(
    LANGUAGES.map((lang) => [lang, require(path.join(LOCALES_DIR, `${lang}.json`))]),
  );
  const { errors, keyCount } = check(locales);
  if (errors.length) {
    console.error(`i18n check failed (${errors.length}):\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`i18n check passed: ${keyCount} keys in ${LANGUAGES.join(', ')}`);
}
