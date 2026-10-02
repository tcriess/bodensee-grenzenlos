import de from './locales/de.js';
import en from './locales/en.js';

export const LOCALES = { de, en };
const FALLBACK = 'de';
let current = FALLBACK;

export const getLang = () => current;
export const intlLocale = () => LOCALES[current].$locale;

export function setLang(lang) {
  current = LOCALES[lang] ? lang : FALLBACK;
  document.documentElement.lang = intlLocale();
}

export function t(key, params = {}) {
  let value = LOCALES[current][key] ?? LOCALES[FALLBACK][key] ?? key;
  if (typeof value === 'object') {
    value = value[new Intl.PluralRules(intlLocale()).select(params.count ?? 0)] ?? value.other;
  }
  return value.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
}

// Picks a translation from inline {de, en} objects used in data files.
export const pick = obj => obj[current] ?? obj[FALLBACK];

export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.title = t('app.title');
}
