import {
  barcodeLookupResultSchema,
  confirmBarcodeInputSchema,
  isValidEan13,
  normalizeBarcode,
} from './barcode';

describe('isValidEan13', () => {
  it.each(['0711719541783', '4006381333931', '9780201379624'])('accepts %s', (code) => {
    expect(isValidEan13(code)).toBe(true);
  });

  it.each(['0711719541784', '071171954178', 'abcdefghijklm', ''])('rejects %p', (code) => {
    expect(isValidEan13(code)).toBe(false);
  });
});

describe('normalizeBarcode', () => {
  it('turns UPC-A into EAN-13 and keeps EAN-13 as is', () => {
    expect(normalizeBarcode('711719541783')).toBe('0711719541783');
    expect(normalizeBarcode('4006381333931')).toBe('4006381333931');
  });

  it('ignores spaces and dashes', () => {
    expect(normalizeBarcode('7 11719-54178 3')).toBe('0711719541783');
  });

  it('rejects anything that is not a valid code', () => {
    expect(normalizeBarcode('711719541784')).toBeNull();
    expect(normalizeBarcode('12345')).toBeNull();
  });
});

describe('barcode schemas', () => {
  it('validate confirmations', () => {
    const valid = { ean: '0711719541783', igdbGameId: 119133, platform: 'ps5' };
    expect(confirmBarcodeInputSchema.safeParse(valid).success).toBe(true);
    expect(confirmBarcodeInputSchema.safeParse({ ...valid, ean: '0711719541784' }).success).toBe(
      false,
    );
    expect(confirmBarcodeInputSchema.safeParse({ ...valid, platform: 'pc' }).success).toBe(false);
  });

  it('validate lookup results', () => {
    expect(
      barcodeLookupResultSchema.safeParse({ ean: '0711719541783', suggestions: [] }).success,
    ).toBe(true);
  });
});
