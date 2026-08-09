/**
 * Lead validation rules, shared by the CSV import route and the scraper ingest
 * endpoint. Deliberately free of Prisma imports so it stays unit-testable
 * without a database; the queries live in leads-db.ts.
 */

/** IdStatus for a lead that is ready to call. */
export const NEW_LEAD_STATUS = 3;

export type RawLead = {
  businessName: string;
  phone: string;
  address: string;
  location: string;
  industry: string;
  timeZone: string;
};

export type Blocklists = {
  keywords: string[];
  areaCodes: Set<string>;
};

export type Rejection =
  | { kind: 'missing-name' }
  | { kind: 'missing-phone' }
  | { kind: 'invalid-phone'; phone: string }
  | { kind: 'blocked-area-code'; areaCode: string }
  | { kind: 'blocked-name'; keyword: string };

export type Classification =
  | { ok: true; formatted: string; digits: string }
  | { ok: false; reason: Rejection };

export function cleanPhone(phone: string): { formatted: string; digits: string } {
  const digits = phone.replace(/\D/g, '');
  let formatted = digits;
  if (digits.length === 10) {
    formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    formatted = `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return { formatted, digits };
}

export function areaCodeOf(digits: string): string {
  // Only a leading 1 is a country code. Slicing every 11-digit number read the
  // wrong three digits, letting a blocked area code through.
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return national.slice(0, 3);
}

/** Escapes a keyword so punctuation like "7-eleven" or "best heating & air" stays literal. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whether a business name contains the keyword as a whole word.
 *
 * Plain `includes` was the original rule and it silently discarded real leads:
 * the two-letter "wm" (for Waste Management) matched Snowmobile, Newman and
 * Endowment — 3,697 businesses — and "arco" matched Barco, Charcol and Warco,
 * another 2,447. Every one of those was a business somebody could have called.
 *
 * Word boundaries keep the short brand names usable instead of forcing a choice
 * between blocking a chain and keeping its lookalikes. "BP Gas" still matches
 * "bp"; "Snowmobile Rentals" no longer matches "wm".
 */
function matchesKeyword(nameLower: string, keyword: string): boolean {
  // \b sits between a word and a non-word character, so a keyword starting or
  // ending in punctuation ("7-eleven") would never match with it attached.
  const start = /^\w/.test(keyword) ? '\\b' : '';
  const end = /\w$/.test(keyword) ? '\\b' : '';
  return new RegExp(`${start}${escapeRegex(keyword)}${end}`).test(nameLower);
}

export function classifyLead(lead: RawLead, blocklists: Blocklists): Classification {
  if (!lead.businessName) return { ok: false, reason: { kind: 'missing-name' } };
  if (!lead.phone) return { ok: false, reason: { kind: 'missing-phone' } };

  const { formatted, digits } = cleanPhone(lead.phone);
  if (digits.length < 10) return { ok: false, reason: { kind: 'invalid-phone', phone: lead.phone } };

  const areaCode = areaCodeOf(digits);
  if (blocklists.areaCodes.has(areaCode)) {
    return { ok: false, reason: { kind: 'blocked-area-code', areaCode } };
  }

  const nameLower = lead.businessName.toLowerCase();
  const keyword = blocklists.keywords.find((kw) => matchesKeyword(nameLower, kw));
  if (keyword) return { ok: false, reason: { kind: 'blocked-name', keyword } };

  return { ok: true, formatted, digits };
}

export function describeRejection(reason: Rejection, rowNum: number, businessName: string): string {
  switch (reason.kind) {
    case 'missing-name':
      return `Row ${rowNum}: Missing business name`;
    case 'missing-phone':
      return `Row ${rowNum}: Missing phone number`;
    case 'invalid-phone':
      return `Row ${rowNum}: Invalid phone number "${reason.phone}"`;
    case 'blocked-area-code':
      return `Row ${rowNum}: Blocked area code (${reason.areaCode}) — "${businessName}"`;
    case 'blocked-name':
      return `Row ${rowNum}: Blocked business name keyword "${reason.keyword}" — "${businessName}"`;
  }
}
