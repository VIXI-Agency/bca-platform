import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { importValidateSchema } from '@/lib/validators';
import { buildImportSummaryEmailHTML, sendEmail } from '@/lib/email';

function cleanPhone(phone: string): { formatted: string; digits: string } {
  const digits = phone.replace(/\D/g, '');
  // Format as (XXX) XXX-XXXX if 10 digits, +X (XXX) XXX-XXXX if 11
  let formatted = digits;
  if (digits.length === 10) {
    formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    formatted = `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return { formatted, digits };
}

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
    const [blockedNames, blockedAreaCodes] = await Promise.all([
      prisma.blockedName.findMany({ select: { keyword: true } }),
      prisma.blockedAreaCode.findMany({ select: { areaCode: true } }),
    ]);
    const blockedKeywords = blockedNames.map((n) => n.keyword.toLowerCase());
    const blockedCodes = new Set(blockedAreaCodes.map((c) => c.areaCode));

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 1;

      try {
        const businessName = row.businessName || row.BusinessName || '';
        const phone = row.phone || row.Phone || '';
        const address = row.address || row.Address || '';
        const location = row.location || row.Location || '';
        const industry = row.industry || row.Industry || '';
        const timeZone = row.timeZone || row.TimeZone || row.timezone || '';

        if (!businessName) {
          errors.push(`Row ${rowNum}: Missing business name`);
          skipped++;
          continue;
        }

        if (!phone) {
          errors.push(`Row ${rowNum}: Missing phone number`);
          skipped++;
          continue;
        }

        const { formatted, digits } = cleanPhone(phone);

        if (digits.length < 10) {
          errors.push(`Row ${rowNum}: Invalid phone number "${phone}"`);
          skipped++;
          continue;
        }

        // Check blocked area code
        const areaCode = digits.length === 11 ? digits.slice(1, 4) : digits.slice(0, 3);
        if (blockedCodes.has(areaCode)) {
          errors.push(`Row ${rowNum}: Blocked area code (${areaCode}) — "${businessName}"`);
          skipped++;
          continue;
        }

        // Check blocked business name keywords
        const nameLower = businessName.toLowerCase();
        const matchedKeyword = blockedKeywords.find((kw) => nameLower.includes(kw));
        if (matchedKeyword) {
          errors.push(`Row ${rowNum}: Blocked business name keyword "${matchedKeyword}" — "${businessName}"`);
          skipped++;
          continue;
        }

        // Check for duplicate phone (by digits)
        const existingBusiness = await prisma.business.findFirst({
          where: { phoneDigits: digits },
        });

        if (existingBusiness) {
          errors.push(`Row ${rowNum}: Duplicate phone number "${phone}" (business "${existingBusiness.businessName}")`);
          skipped++;
          continue;
        }

        await prisma.business.create({
          data: {
            businessName,
            phone: formatted,
            // Do not set phoneDigits: SQL Server defines PhoneDigits as a computed column.
            // It is populated automatically from Phone and can still be queried for duplicates.
            address,
            location,
            industry,
            timeZone,
            idStatus: 3, // available
          },
        });

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
    const businessesReadyToCall = await prisma.business.count({ where: { idStatus: 3 } });
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
      to: [
        { email: 'support@benjaminchaise.com', name: 'BenjaminChaise Support' },
        { email: 'brianna@benjaminchaise.com', name: 'Brianna' },
        { email: 'michael@benjaminchaise.com', name: 'Michael' },
      ],
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
