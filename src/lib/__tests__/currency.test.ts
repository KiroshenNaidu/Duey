import { afterEach, describe, expect, it } from 'vitest';
import { formatCurrency, formatCurrencyShort, getPdfCurrencySymbol, setCurrencyCode } from '../utils';

// Only the parts that do not depend on the phone's region (commas vs dots, spaces).
const digits = (s: string) => s.replace(/[^\d]/g, '');

afterEach(() => setCurrencyCode('ZAR'));

describe('currency', () => {
  it('defaults to rand', () => {
    setCurrencyCode('');
    expect(formatCurrency(100)).toContain('R');
  });

  it('follows the currency picked in Settings', () => {
    setCurrencyCode('EUR');
    expect(formatCurrency(100)).toContain('€');
    expect(formatCurrency(100)).not.toMatch(/R/);
    setCurrencyCode('USD');
    expect(formatCurrency(100)).toContain('$');
  });

  it('shortens amounts for buttons without losing the currency', () => {
    setCurrencyCode('ZAR');
    expect(formatCurrencyShort(100)).toBe('R100');
    setCurrencyCode('EUR');
    expect(formatCurrencyShort(100)).toBe('€100');
    expect(digits(formatCurrencyShort(1500))).toBe('1500');
  });

  it('uses the currency code in PDFs when the PDF font has no symbol for it', () => {
    expect(getPdfCurrencySymbol('ZAR')).toBe('R');
    expect(getPdfCurrencySymbol('EUR')).toBe('€');
    expect(getPdfCurrencySymbol('INR')).toBe('INR');
    expect(getPdfCurrencySymbol('NGN')).toBe('NGN');
  });
});
