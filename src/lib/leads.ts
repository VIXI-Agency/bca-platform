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
  const keyword = blocklists.keywords.find((kw) => nameLower.includes(kw));
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
