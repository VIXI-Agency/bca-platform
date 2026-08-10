import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { importValidateSchema } from '@/lib/validators';
import { buildImportSummaryEmailHTML, sendEmail, REPORT_RECIPIENTS } from '@/lib/email';
import { classifyLead, describeRejection, NEW_LEAD_STATUS, type RawLead } from '@/lib/leads';
import { loadBlocklists, findByPhoneDigits, createLead } from '@/lib/leads-db';

function formatReportDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

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

    const { data, originalFile } = parsed.data;

    const MAX_ROWS = 5000;
    if (data.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Import limited to ${MAX_ROWS} rows at a time. You sent ${data.length}.` },
        { status: 400 },
      );
    }

    // Load blacklists once before processing
    const blocklists = await loadBlocklists();

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 1;

      try {
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
          errors.push(describeRejection(verdict.reason, rowNum, lead.businessName));
          skipped++;
          continue;
        }

        const existingBusiness = await findByPhoneDigits(verdict.digits);
        if (existingBusiness) {
          errors.push(`Row ${rowNum}: Duplicate phone number "${lead.phone}" (business "${existingBusiness.businessName}")`);
          skipped++;
          continue;
        }

        await createLead(lead, verdict.formatted);

        imported++;
      } catch (err) {
        errors.push(`Row ${rowNum}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        skipped++;
      }
    }

    const duplicatesFound = errors.filter((error) => error.includes('Duplicate phone number')).length;
    const blackListBusinesses = errors.filter((error) =>
      error.includes('Blocked area code') || error.includes('Blocked business name keyword')
    ).length;
    const businessesReadyToCall = await prisma.business.count({ where: { idStatus: NEW_LEAD_STATUS } });
    const importedBy = session.user.name || 'Carlos Aragon';
    const fileName = originalFile?.name || 'import.csv';

    const html = buildImportSummaryEmailHTML({
      importedBy,
      reportDate: formatReportDate(new Date()),
      fileName,
      totalRecords: data.length,
      duplicatesFound,
      blackListBusinesses,
      businessesImported: imported,
      businessesReadyToCall,
    });

    const attachments = originalFile?.content
      ? [{
          content: Buffer.from(originalFile.content, 'utf8').toString('base64'),
          filename: fileName,
          type: originalFile.type || 'text/csv',
          disposition: 'attachment' as const,
        }]
      : undefined;

    const emailSent = await sendEmail({
      to: REPORT_RECIPIENTS,
      subject: 'New Leads Imported!',
      html,
      attachments,
    });

    return NextResponse.json({ imported, skipped, errors, emailSent });
  } catch (error) {
    console.error('POST /api/import error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
