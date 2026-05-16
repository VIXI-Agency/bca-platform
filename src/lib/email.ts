const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const FROM_EMAIL = 'noreply@yourdebtcollectors.com';
const FROM_NAME = 'PulseBC Calling System';

/** Escape user-supplied strings before interpolating into HTML emails. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface SendEmailAttachment {
  content: string;
  filename: string;
  type?: string;
  disposition?: 'attachment' | 'inline';
}

interface SendEmailParams {
  to: { email: string; name: string }[];
  cc?: { email: string; name: string }[];
  subject: string;
  html: string;
  attachments?: SendEmailAttachment[];
}

export async function sendEmail({ to, cc, subject, html, attachments }: SendEmailParams): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    console.warn('SENDGRID_API_KEY not set, skipping email');
    return false;
  }

  const personalizations: Record<string, unknown>[] = [{
    to: to.map(r => ({ email: r.email, name: r.name })),
    ...(cc && cc.length > 0 ? { cc: cc.map(r => ({ email: r.email, name: r.name })) } : {}),
  }];

  const payload: Record<string, unknown> = {
    personalizations,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject,
    content: [{ type: 'text/html', value: html }],
  };

  if (attachments && attachments.length > 0) {
    payload.attachments = attachments.map((attachment) => ({
      content: attachment.content,
      filename: attachment.filename,
      type: attachment.type || 'text/csv',
      disposition: attachment.disposition || 'attachment',
    }));
  }

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`SendGrid error ${res.status}: ${body}`);
    return false;
  }

  return true;
}


interface ImportSummaryEmailData {
  importedBy: string;
  reportDate: string;
  fileName: string;
  totalRecords: number;
  duplicatesFound: number;
  blackListBusinesses: number;
  businessesImported: number;
  businessesReadyToCall: number;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export function buildImportSummaryEmailHTML(data: ImportSummaryEmailData): string {
  const safe = {
    importedBy: escapeHtml(data.importedBy),
    reportDate: escapeHtml(data.reportDate),
    fileName: escapeHtml(data.fileName),
    totalRecords: formatNumber(data.totalRecords),
    duplicatesFound: formatNumber(data.duplicatesFound),
    blackListBusinesses: formatNumber(data.blackListBusinesses),
    businessesImported: formatNumber(data.businessesImported),
    businessesReadyToCall: formatNumber(data.businessesReadyToCall),
  };

  const statCard = (label: string, value: string, color: string, bg: string) => `
    <td width="50%" style="padding: 8px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${bg}; border: 1px solid #e2e8f0; border-radius: 14px;">
        <tr>
          <td style="padding: 20px;">
            <p style="margin: 0 0 8px 0; font-size: 12px; color: #64748b; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700;">${label}</p>
            <p style="margin: 0; font-size: 30px; line-height: 1; color: ${color}; font-family: Arial, sans-serif; font-weight: 800;">${value}</p>
          </td>
        </tr>
      </table>
    </td>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9; padding:32px 0;">
    <tr><td align="center">
      <table width="680" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 8px 30px rgba(15,23,42,0.08);">
        <tr><td style="height:5px; background:linear-gradient(90deg,#0f172a 0%,#0891b2 55%,#22d3ee 100%);"></td></tr>
        <tr>
          <td style="padding:30px 40px 20px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0; font-size:22px; font-weight:800; color:#0f172a; font-family:Arial,sans-serif;">Pulse<span style="color:#0891b2;">BC</span></p>
                  <p style="margin:4px 0 0 0; font-size:12px; color:#64748b; font-family:Arial,sans-serif;">BCA Calling System</p>
                </td>
                <td align="right"><span style="display:inline-block; padding:7px 14px; background:#ecfeff; color:#0891b2; border-radius:999px; font-size:11px; font-weight:800; letter-spacing:1px; font-family:Arial,sans-serif;">NEW LEADS IMPORTED</span></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 24px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%); border-radius:16px;">
              <tr><td style="padding:34px;">
                <p style="margin:0 0 10px 0; font-size:16px; color:#cbd5e1; font-family:Arial,sans-serif;">Hi Brianna and Ford!</p>
                <h1 style="margin:0 0 12px 0; font-size:28px; color:#ffffff; font-family:Arial,sans-serif; line-height:1.25;">${safe.importedBy} just imported new Businesses into BCA Calling System.</h1>
                <p style="margin:0; font-size:14px; color:#94a3b8; font-family:Arial,sans-serif; line-height:1.6;">The original CSV file is attached. Below is the import summary for <strong style="color:#22d3ee;">${safe.fileName}</strong>.</p>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr><td style="padding:0 40px 8px 40px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:0 8px 12px 8px; font-size:13px; color:#64748b; font-family:Arial,sans-serif;"><strong style="color:#0f172a;">Report Date:</strong> ${safe.reportDate}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 32px 28px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>${statCard('# of Records in Imported File', safe.totalRecords, '#0f172a', '#f8fafc')}${statCard('# of Duplicates Found', safe.duplicatesFound, '#d97706', '#fffbeb')}</tr>
            <tr>${statCard('# of Black List Businesses', safe.blackListBusinesses, '#dc2626', '#fef2f2')}${statCard('Businesses Imported', safe.businessesImported, '#16a34a', '#f0fdf4')}</tr>
            <tr>${statCard('Businesses Ready to Call', safe.businessesReadyToCall, '#0891b2', '#ecfeff')}<td width="50%" style="padding:8px;"></td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:22px 40px 30px 40px; border-top:1px solid #e2e8f0; background:#f8fafc;">
          <p style="margin:0; text-align:center; font-size:12px; color:#94a3b8; font-family:Arial,sans-serif;">This message was generated by an automated system. Please do not reply to this message.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

interface CallEmailData {
  type: 'potential-client' | 'info-request' | 'callback';
  closerName: string;
  fromName: string;
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  dmName: string;
  dmPhone: string;
  dmEmail: string;
  comments: string;
  debtorName?: string;
  amountOwed?: string;
  agreementSent?: string;
  callBackDate?: string;
}

export function buildCallEmailHTML(data: CallEmailData): string {
  // Escape all user-supplied fields to prevent HTML injection
  const safe = {
    closerName: escapeHtml(data.closerName),
    fromName: escapeHtml(data.fromName),
    businessName: escapeHtml(data.businessName),
    businessPhone: escapeHtml(data.businessPhone),
    businessAddress: escapeHtml(data.businessAddress),
    dmName: escapeHtml(data.dmName),
    dmPhone: escapeHtml(data.dmPhone),
    dmEmail: escapeHtml(data.dmEmail),
    comments: escapeHtml(data.comments),
    debtorName: escapeHtml(data.debtorName || 'N/A'),
    amountOwed: escapeHtml(data.amountOwed || 'N/A'),
    agreementSent: escapeHtml(data.agreementSent || 'N/A'),
    callBackDate: escapeHtml(data.callBackDate || 'N/A'),
  };

  const isPC = data.type === 'potential-client';
  const isCB = data.type === 'callback';
  const typeBadge = isPC ? 'POTENTIAL CLIENT' : isCB ? 'CALL BACK REQUEST' : 'INFO REQUEST';
  const greeting = isPC ? 'You Got a Potential Client!' : isCB ? 'You Got a Call Back Request!' : 'You Got an Info Request!';

  let debtorSection = '';
  if (isPC) {
    debtorSection = `
      <tr>
        <td style="padding: 0 40px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
            <tr>
              <td style="padding: 20px 24px; background-color: #f0fdfa; border-radius: 12px; border-left: 4px solid #0891b2;">
                <p style="margin: 0 0 12px 0; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #0891b2; font-family: 'Inter', Arial, sans-serif;">Debtor Details</p>
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td width="50%" style="padding: 4px 0; vertical-align: top;">
                      <p style="margin: 0; font-size: 12px; color: #64748b; font-family: 'Inter', Arial, sans-serif;">Debtor Name</p>
                      <p style="margin: 2px 0 0 0; font-size: 15px; color: #0f172a; font-weight: 600; font-family: 'Inter', Arial, sans-serif;">${safe.debtorName}</p>
                    </td>
                    <td width="50%" style="padding: 4px 0; vertical-align: top;">
                      <p style="margin: 0; font-size: 12px; color: #64748b; font-family: 'Inter', Arial, sans-serif;">Amount Owed</p>
                      <p style="margin: 2px 0 0 0; font-size: 15px; color: #0f172a; font-weight: 700; font-family: 'Inter', Arial, sans-serif;">${safe.amountOwed}</p>
                    </td>
                  </tr>
                  <tr>
                    <td width="50%" style="padding: 8px 0 4px 0; vertical-align: top;">
                      <p style="margin: 0; font-size: 12px; color: #64748b; font-family: 'Inter', Arial, sans-serif;">Agreement Sent?</p>
                      <p style="margin: 2px 0 0 0; font-size: 15px; color: #0f172a; font-weight: 600; font-family: 'Inter', Arial, sans-serif;">${safe.agreementSent}</p>
                    </td>
                    <td width="50%" style="padding: 8px 0 4px 0; vertical-align: top;">
                      <p style="margin: 0; font-size: 12px; color: #64748b; font-family: 'Inter', Arial, sans-serif;">Callback Date</p>
                      <p style="margin: 2px 0 0 0; font-size: 15px; color: #0f172a; font-weight: 600; font-family: 'Inter', Arial, sans-serif;">${safe.callBackDate}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 32px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06);">
        <tr><td style="height: 4px; background: linear-gradient(90deg, #0891b2 0%, #06b6d4 50%, #22d3ee 100%);"></td></tr>
        <tr>
          <td style="padding: 28px 40px 20px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align: middle;">
                  <table cellpadding="0" cellspacing="0"><tr>
                    <td style="vertical-align: middle; padding-right: 10px;"><img src="https://yourdebtcollectors.com/icon-192.png" height="40" width="40" style="display: block; border-radius: 8px;"></td>
                    <td style="vertical-align: middle;"><span style="font-size: 20px; font-weight: 700; color: #0f172a; font-family: 'Inter', Arial, sans-serif;">Pulse<span style="color: #0891b2;">BC</span></span></td>
                  </tr></table>
                </td>
                <td style="vertical-align: middle; text-align: right;">
                  <span style="display: inline-block; padding: 6px 14px; background-color: ${isPC ? '#eff6ff' : '#f0fdfa'}; color: ${isPC ? '#1d4ed8' : '#0891b2'}; font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; border-radius: 20px; font-family: 'Inter', Arial, sans-serif;">${typeBadge}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 0 40px 24px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius: 12px;">
              <tr>
                <td style="padding: 32px;">
                  <p style="margin: 0 0 4px 0; font-size: 14px; color: #94a3b8; font-family: 'Inter', Arial, sans-serif;">Hi, ${safe.closerName}!</p>
                  <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #ffffff; font-family: 'Inter', Arial, sans-serif;">${greeting}</h1>
                  <p style="margin: 0; font-size: 13px; color: #64748b; font-family: 'Inter', Arial, sans-serif;">Submitted by <span style="color: #22d3ee; font-weight: 600;">${safe.fromName}</span></p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 0 40px 24px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="48%" style="vertical-align: top; padding-right: 12px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <tr>
                      <td style="padding: 20px;">
                        <p style="margin: 0 0 14px 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #0891b2; font-family: 'Inter', Arial, sans-serif;">Business Details</p>
                        <p style="margin: 0; font-size: 12px; color: #64748b;">Name</p>
                        <p style="margin: 2px 0 10px 0; font-size: 15px; color: #0f172a; font-weight: 600; font-family: 'Inter', Arial, sans-serif;">${safe.businessName}</p>
                        <p style="margin: 0; font-size: 12px; color: #64748b;">Phone</p>
                        <p style="margin: 2px 0 10px 0; font-size: 15px; color: #0f172a; font-weight: 600; font-family: 'Inter', Arial, sans-serif;">${safe.businessPhone}</p>
                        <p style="margin: 0; font-size: 12px; color: #64748b;">Address</p>
                        <p style="margin: 2px 0 0 0; font-size: 14px; color: #0f172a; font-weight: 500; font-family: 'Inter', Arial, sans-serif;">${safe.businessAddress}</p>
                      </td>
                    </tr>
                  </table>
                </td>
                <td width="4%"></td>
                <td width="48%" style="vertical-align: top; padding-left: 12px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <tr>
                      <td style="padding: 20px;">
                        <p style="margin: 0 0 14px 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #0891b2; font-family: 'Inter', Arial, sans-serif;">Decision Maker</p>
                        <p style="margin: 0; font-size: 12px; color: #64748b;">Name</p>
                        <p style="margin: 2px 0 10px 0; font-size: 15px; color: #0f172a; font-weight: 600; font-family: 'Inter', Arial, sans-serif;">${safe.dmName}</p>
                        <p style="margin: 0; font-size: 12px; color: #64748b;">Phone</p>
                        <p style="margin: 2px 0 10px 0; font-size: 15px; color: #0f172a; font-weight: 600; font-family: 'Inter', Arial, sans-serif;">${safe.dmPhone}</p>
                        <p style="margin: 0; font-size: 12px; color: #64748b;">Email</p>
                        <p style="margin: 2px 0 0 0; font-size: 14px; color: #0891b2; font-weight: 500; font-family: 'Inter', Arial, sans-serif;">${safe.dmEmail}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ${debtorSection}
        <tr>
          <td style="padding: 0 40px 24px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fefce8; border-radius: 12px; border: 1px solid #fde68a;">
              <tr>
                <td style="padding: 20px 24px;">
                  <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #d97706; font-family: 'Inter', Arial, sans-serif;">Comments</p>
                  <p style="margin: 0; font-size: 15px; color: #451a03; line-height: 1.6; font-family: 'Inter', Arial, sans-serif;">${safe.comments || 'No comments'}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 16px 40px 28px 40px; border-top: 1px solid #f1f5f9;">
            <p style="margin: 0; text-align: center; font-size: 11px; color: #94a3b8; font-family: 'Inter', Arial, sans-serif;">This is an automated notification from PulseBC Calling System.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
