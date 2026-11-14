import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { importValidateSchema } from '@/lib/validators';
import { classifyLead, describeRejection, type RawLead } from '@/lib/leads';
import { loadBlocklists } from '@/lib/leads-db';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as { role: number }).role;
    if (role !== 1) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = importValidateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { data } = parsed.data;
    const valid: number[] = [];
    const errors: { row: number; field: string; message: string }[] = [];
    const phoneDigitsInBatch = new Map<string, number[]>();
    const blocklists = await loadBlocklists();

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 1;
      const lead: RawLead = {
        businessName: row.businessName || row.BusinessName || '',
        phone: row.phone || row.Phone || '',
        address: row.address || row.Address || '',
        location: row.location || row.Location || '',
        industry: row.industry || row.Industry || '',
        timeZone: row.timeZone || row.TimeZone || row.timezone || '',
      };

      const verdict = classifyLead(lead, blocklists);
      if (!verdict.ok) {
        const kind = verdict.reason.kind;
        errors.push({
          row: rowNum,
          field: kind === 'missing-name' || kind === 'blocked-name' ? 'businessName' : 'phone',
          // Preview already prints "Row N:" in front of message.
          message: describeRejection(verdict.reason, rowNum, lead.businessName).replace(/^Row \d+: /, ''),
        });
        continue;
      }

      const existing = phoneDigitsInBatch.get(verdict.digits);
      if (existing) existing.push(rowNum);
      else phoneDigitsInBatch.set(verdict.digits, [rowNum]);
      valid.push(rowNum);
    }

    // Check for duplicates within the batch
    for (const rows of phoneDigitsInBatch.values()) {
      if (rows.length > 1) {
        for (const rowNum of rows.slice(1)) {
          errors.push({ row: rowNum, field: 'phone', message: `Duplicate phone number within import data` });
          const idx = valid.indexOf(rowNum);
          if (idx !== -1) valid.splice(idx, 1);
        }
      }
    }

    // Check for duplicates against existing database records
    const allDigits = Array.from(phoneDigitsInBatch.keys());
    if (allDigits.length > 0) {
      const existingBusinesses = await prisma.business.findMany({
        where: { phoneDigits: { in: allDigits } },
        select: { phoneDigits: true, businessName: true },
      });

      const existingDigitsMap = new Map(
        existingBusinesses.map((b) => [b.phoneDigits, b.businessName]),
      );

      for (const [digits, rows] of phoneDigitsInBatch) {
        if (existingDigitsMap.has(digits)) {
          for (const rowNum of rows) {
            errors.push({
              row: rowNum,
              field: 'phone',
              message: `Phone number already exists (business "${existingDigitsMap.get(digits)}")`,
            });
            const idx = valid.indexOf(rowNum);
            if (idx !== -1) valid.splice(idx, 1);
          }
        }
      }
    }

    return NextResponse.json({
      totalRows: data.length,
      validRows: valid.length,
      invalidRows: data.length - valid.length,
      errors,
    });
  } catch (error) {
    console.error('POST /api/import/validate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
