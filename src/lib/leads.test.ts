import { describe, it, expect } from 'vitest';
import {
  cleanPhone,
  areaCodeOf,
  classifyLead,
  describeRejection,
  type RawLead,
  type Blocklists,
} from './leads';

const lead = (over: Partial<RawLead> = {}): RawLead => ({
  businessName: 'Acme Plumbing',
  phone: '(210) 555-1234',
  address: '1 Main St',
  location: 'San Antonio TX 78205',
  industry: 'Plumbing',
  timeZone: 'CST',
  ...over,
});

const lists = (over: Partial<Blocklists> = {}): Blocklists => ({
  keywords: [],
  areaCodes: new Set<string>(),
  ...over,
});

describe('cleanPhone', () => {
  it('formats ten digits', () => {
    expect(cleanPhone('2105551234')).toEqual({ formatted: '(210) 555-1234', digits: '2105551234' });
  });

  it('formats eleven digits starting with 1', () => {
    expect(cleanPhone('12105551234')).toEqual({ formatted: '+1 (210) 555-1234', digits: '12105551234' });
  });

  it('strips punctuation before formatting', () => {
    expect(cleanPhone('(210) 555-1234')).toEqual({ formatted: '(210) 555-1234', digits: '2105551234' });
  });

  it('leaves other lengths unformatted', () => {
    expect(cleanPhone('5551234')).toEqual({ formatted: '5551234', digits: '5551234' });
    expect(cleanPhone('21055512345')).toEqual({ formatted: '21055512345', digits: '21055512345' });
  });

  it('returns empty for input with no digits', () => {
    expect(cleanPhone('')).toEqual({ formatted: '', digits: '' });
    expect(cleanPhone('call us')).toEqual({ formatted: '', digits: '' });
  });

  it('treats an extension as trailing digits', () => {
    expect(cleanPhone('210-555-1234 x89')).toEqual({ formatted: '210555123489', digits: '210555123489' });
  });
});

describe('areaCodeOf', () => {
  it('reads the first three digits of a ten-digit number', () => {
    expect(areaCodeOf('2105551234')).toBe('210');
  });

  it('skips the country code on an eleven-digit number', () => {
    expect(areaCodeOf('12105551234')).toBe('210');
  });

  it('does not skip a leading digit that is not a country code', () => {
    expect(areaCodeOf('25551234567')).toBe('255');
  });
});

describe('classifyLead', () => {
  it('accepts a valid lead', () => {
    expect(classifyLead(lead(), lists())).toEqual({
      ok: true,
      formatted: '(210) 555-1234',
      digits: '2105551234',
    });
  });

  it('rejects a missing business name', () => {
    expect(classifyLead(lead({ businessName: '' }), lists())).toEqual({
      ok: false,
      reason: { kind: 'missing-name' },
    });
  });

  it('rejects a missing phone', () => {
    expect(classifyLead(lead({ phone: '' }), lists())).toEqual({
      ok: false,
      reason: { kind: 'missing-phone' },
    });
  });

  it('rejects a phone with fewer than ten digits', () => {
    expect(classifyLead(lead({ phone: '555-1234' }), lists())).toEqual({
      ok: false,
      reason: { kind: 'invalid-phone', phone: '555-1234' },
    });
  });

  it('rejects a blocked area code', () => {
    expect(classifyLead(lead(), lists({ areaCodes: new Set(['210']) }))).toEqual({
      ok: false,
      reason: { kind: 'blocked-area-code', areaCode: '210' },
    });
  });

  it('rejects a blocked name keyword, case-insensitively', () => {
    expect(classifyLead(lead({ businessName: 'ACME Plumbing' }), lists({ keywords: ['acme'] }))).toEqual({
      ok: false,
      reason: { kind: 'blocked-name', keyword: 'acme' },
    });
  });

  it('checks the area code before the name keyword', () => {
    const result = classifyLead(
      lead({ businessName: 'Acme' }),
      lists({ keywords: ['acme'], areaCodes: new Set(['210']) }),
    );
    expect(result).toEqual({ ok: false, reason: { kind: 'blocked-area-code', areaCode: '210' } });
  });
});

describe('describeRejection', () => {
  it('matches the message the import route produced before extraction', () => {
    expect(describeRejection({ kind: 'missing-name' }, 4, '')).toBe('Row 4: Missing business name');
    expect(describeRejection({ kind: 'missing-phone' }, 4, 'Acme')).toBe('Row 4: Missing phone number');
    expect(describeRejection({ kind: 'invalid-phone', phone: '555' }, 4, 'Acme')).toBe(
      'Row 4: Invalid phone number "555"',
    );
    expect(describeRejection({ kind: 'blocked-area-code', areaCode: '210' }, 4, 'Acme')).toBe(
      'Row 4: Blocked area code (210) — "Acme"',
    );
    expect(describeRejection({ kind: 'blocked-name', keyword: 'acme' }, 4, 'Acme')).toBe(
      'Row 4: Blocked business name keyword "acme" — "Acme"',
    );
  });
});
