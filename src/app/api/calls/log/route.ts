import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logCallSchema } from '@/lib/validators';
import { Prisma } from '@prisma/client';
import { sendEmail, buildCallEmailHTML } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { userId: number }).userId;
    const body = await request.json();
    const parsed = logCallSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const now = new Date();

    // Base call data shared by all dispositions
    const callData: Prisma.CallUncheckedCreateInput = {
      idUser: userId,
      idBusiness: data.idBusiness,
      idDisposition: data.idDisposition,
      callDate: now,
      dMakerName: '',
      dMEmail: '',
      dMPhone: '',
      pDebtorName: '',
      comments: data.comments || '',
    };

    // Enrich fields based on disposition type
    switch (data.idDisposition) {
      case 4: // Potential Client
        callData.dMakerName = data.dmakerName || '';
        callData.dMEmail = data.dmakerEmail || '';
        callData.dMPhone = data.dmakerPhone || '';
        callData.pDebtorName = data.debtorName || '';
        callData.pDebtorAmmount = data.debtAmount != null ? String(data.debtAmount) : null;
        callData.agreementSent = data.agreementSent != null ? String(data.agreementSent) : null;
        callData.idCloser = data.idCloser ?? null;
        callData.callBack = data.callBack ? new Date(data.callBack) : null;
        break;

      case 10: // Info Request
        callData.dMakerName = data.dmakerName || '';
        callData.dMEmail = data.dmakerEmail || '';
        callData.dMPhone = data.dmakerPhone || '';
        callData.idCloser = data.idCloser ?? null;
        break;

      case 8: // Call Back
        callData.dMakerName = data.dmakerName || '';
        callData.dMEmail = data.dmakerEmail || '';
        callData.dMPhone = data.dmakerPhone || '';
        callData.idCloser = data.idCloser ?? null;
        callData.callBack = data.callBack ? new Date(data.callBack) : null;
        break;
    }

    // Wrap call creation and business status update in a transaction
    const call = await prisma.$transaction(async (tx) => {
      const newCall = await tx.call.create({ data: callData });

      // Mark business as called (idStatus = 2) — matches legacy stored procedure behavior.
      // Clearing onCallSince retires the handout: the lead has left status 1 for
      // good, and a stale timestamp would linger on a row the reclaim can never
      // reach anyway.
      await tx.business.update({
        where: { idBusiness: data.idBusiness },
        data: { idStatus: 2, onCallSince: null },
      });

      return newCall;
    });

    // Send email notification for Potential Client (4), Call Back (8), and Info Request (10)
    if (data.idDisposition === 4 || data.idDisposition === 8 || data.idDisposition === 10) {
      // Fire-and-forget: don't block the response
      sendCallNotificationEmail(data, userId).catch((err) =>
        console.error('Email notification error:', err)
      );
    }

    return NextResponse.json(call, { status: 201 });
  } catch (error) {
    console.error('POST /api/calls/log error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function sendCallNotificationEmail(
  data: {
    idBusiness: number;
    idDisposition: number;
    idCloser?: number;
    dmakerName?: string;
    dmakerEmail?: string;
    dmakerPhone?: string;
    debtorName?: string;
    debtAmount?: number;
    agreementSent?: boolean;
    callBack?: string;
    comments?: string;
  },
  callerUserId: number
) {
  // Get business info
  const business = await prisma.business.findUnique({
    where: { idBusiness: data.idBusiness },
    select: { businessName: true, phone: true, address: true },
  });

  // Get the caller's name
  const caller = await prisma.user.findUnique({
    where: { idUser: callerUserId },
    select: { name: true, lastname: true },
  });

  // Get the closer (TO recipient)
  let closerUser: { name: string | null; lastname: string | null; email: string | null } | null = null;
  if (data.idCloser) {
    closerUser = await prisma.user.findUnique({
      where: { idUser: data.idCloser },
      select: { name: true, lastname: true, email: true },
    });
  }

  // CC is always admin@benjaminchaise.com only
  const ccUsers = [{ name: 'Admin', lastname: '', email: 'admin@benjaminchaise.com' }];

  const closerName = closerUser
    ? `${closerUser.name} ${closerUser.lastname}`.trim()
    : 'Team';
  const callerName = caller
    ? `${caller.name} ${caller.lastname}`.trim()
    : 'Unknown';

  const typeLabel = data.idDisposition === 4 ? 'Potential Client'
    : data.idDisposition === 8 ? 'Call Back Request'
    : 'Info Request';
  const emailType = data.idDisposition === 4 ? 'potential-client'
    : data.idDisposition === 8 ? 'callback'
    : 'info-request';

  const html = buildCallEmailHTML({
    type: emailType as 'potential-client' | 'callback' | 'info-request',
    closerName,
    fromName: callerName,
    businessName: business?.businessName || 'Unknown',
    businessPhone: business?.phone || 'N/A',
    businessAddress: business?.address || 'N/A',
    dmName: data.dmakerName || 'N/A',
    dmPhone: data.dmakerPhone || 'N/A',
    dmEmail: data.dmakerEmail || 'N/A',
    comments: data.comments || '',
    debtorName: data.debtorName || 'N/A',
    amountOwed: data.debtAmount != null ? `$${data.debtAmount.toFixed(2)}` : 'N/A',
    agreementSent: data.agreementSent != null ? (data.agreementSent ? 'Yes' : 'No') : 'N/A',
    callBackDate: data.callBack || 'N/A',
  });

  const subject = `${typeLabel} - ${business?.businessName || 'Unknown Business'}`;

  // Build TO list: closer first, then CC users
  const to: { email: string; name: string }[] = [];
  if (closerUser?.email) {
    to.push({ email: closerUser.email, name: closerName });
  }

  const cc: { email: string; name: string }[] = ccUsers
    .filter((u) => u.email && u.email !== closerUser?.email)
    .map((u) => ({ email: u.email!, name: `${u.name} ${u.lastname}`.trim() }));

  // If no closer, send to CC users as TO instead
  if (to.length === 0 && cc.length > 0) {
    to.push(cc.shift()!);
  }

  if (to.length === 0) {
    console.warn('No email recipients found, skipping notification');
    return;
  }

  await sendEmail({ to, cc, subject, html });
}
