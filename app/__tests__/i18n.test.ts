import { I18nManager } from 'react-native';

import i18n, { currentLanguage, formatPrice, isolate, setLanguage } from '@/i18n';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { check } = require('../scripts/i18n-check') as {
  check: (locales: Record<string, unknown>) => { errors: string[]; keyCount: number };
};

describe('i18n-check', () => {
  it('passes for matching locales', () => {
    const result = check({ en: { a: { b: 'Hi {{name}}' } }, he: { a: { b: 'שלום {{name}}' } } });
    expect(result).toEqual({ errors: [], keyCount: 1 });
  });

  it('reports keys missing from one language', () => {
    const { errors } = check({ en: { a: 'A', b: 'B' }, he: { a: 'א' } });
    expect(errors).toEqual(['he.json is missing "b"']);
  });

  it('reports empty values', () => {
    const { errors } = check({ en: { a: 'A' }, he: { a: '  ' } });
    expect(errors).toEqual(['he.json "a" must be a non-empty string']);
  });

  it('reports placeholder mismatches', () => {
    const { errors } = check({ en: { a: '{{count}} people' }, he: { a: '{{cnt}} אנשים' } });
    expect(errors[0]).toContain('"a" has different placeholders');
  });

  it('accepts the real locale files', () => {
    const { errors } = check({
      en: require('../src/i18n/locales/en.json'),

      he: require('../src/i18n/locales/he.json'),
    });
    expect(errors).toEqual([]);
  });
});

describe('language', () => {
  const original = I18nManager.isRTL;
  let allowRTL: jest.SpyInstance;
  let forceRTL: jest.SpyInstance;

  beforeEach(() => {
    allowRTL = jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => undefined);
    forceRTL = jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(I18nManager, 'isRTL', { value: original, configurable: true });
  });

  const setRTL = (rtl: boolean) =>
    Object.defineProperty(I18nManager, 'isRTL', { value: rtl, configurable: true });

  it('derives the language from the layout direction', () => {
    setRTL(true);
    expect(currentLanguage()).toBe('he');
    setRTL(false);
    expect(currentLanguage()).toBe('en');
  });

  it('switching to Hebrew allows and forces RTL, then reloads', async () => {
    setRTL(false);
    const reload = jest.fn();
    await expect(setLanguage('he', reload)).resolves.toBe(true);
    expect(allowRTL).toHaveBeenCalledWith(true);
    expect(forceRTL).toHaveBeenCalledWith(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('switching to English disallows RTL so a Hebrew phone shows LTR', async () => {
    setRTL(true);
    const reload = jest.fn();
    await setLanguage('en', reload);
    expect(allowRTL).toHaveBeenCalledWith(false);
    expect(forceRTL).toHaveBeenCalledWith(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the language is already active', async () => {
    setRTL(false);
    const reload = jest.fn();
    await expect(setLanguage('en', reload)).resolves.toBe(false);
    expect(forceRTL).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('formatting', () => {
  it('formats whole-shekel prices without decimals', () => {
    expect(formatPrice(15000, 'en')).toMatch(/₪\s?150$/);
    const he = formatPrice(15000, 'he');
    expect(he).toContain('150');
    expect(he).toContain('₪');
    expect(he).not.toContain('.00');
  });

  it('keeps agorot when the amount has them', () => {
    expect(formatPrice(1050, 'en')).toMatch(/10\.50/);
  });

  it('wraps text in a first-strong isolate', () => {
    expect(isolate('Zelda')).toBe('⁨Zelda⁩');
    expect(isolate(4)).toBe('⁨4⁩');
  });
});

describe('i18n instance', () => {
  it('starts in English in tests and resolves interpolations', () => {
    expect(i18n.language).toBe('en');
    expect(i18n.t('kitchenSink.buttons.pressed', { label: 'Go' })).toBe('“Go” pressed');
  });

  it('has Hebrew resources for every screen it renders', () => {
    expect(i18n.getFixedT('he')('errorBoundary.title')).toBe('משהו השתבש');
  });
});
