import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const WEBHOOK_SECRET = process.env.SMS_WEBHOOK_SECRET;

// Webhook for sms-gate.app (Android SMS Gateway)
// Event payload: { id, webhookId, deviceId, event, payload }
//
// sms:received  → payload: { messageId, sender, recipient, simNumber, message, receivedAt }
// sms:sent      → payload: { id, phoneNumber, message, state }
// sms:delivered → payload: { id, phoneNumber, message, state }
// sms:failed    → payload: { id, phoneNumber, message, state }
export async function POST(request: NextRequest) {
  try {
    // Authenticate webhook using shared secret (passed as Bearer token or query param)
    if (WEBHOOK_SECRET) {
      const authHeader = request.headers.get('authorization');
      const queryToken = request.nextUrl.searchParams.get('token');
      const token = authHeader?.replace('Bearer ', '') || queryToken;
      if (token !== WEBHOOK_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const data = await request.json();
    const { event, payload = {} } = data;

    if (event === 'sms:received') {
      const sender: string = payload.sender ?? payload.phoneNumber ?? '';
      const { message, receivedAt } = payload;

      if (!sender || !message) {
        return NextResponse.json({ ok: true });
      }

      const receivedTime = receivedAt ? new Date(receivedAt) : new Date();

      // Deduplicate: skip if same sender + body already exists within 5 min
      const existing = await prisma.message.findFirst({
        where: {
          phoneNumber: sender,
          messageBody: message,
          direction: 'inbound',
          sentTime: { gte: new Date(receivedTime.getTime() - 5 * 60 * 1000) },
        },
      });

      if (!existing) {
        // Check for MMS attachments (images/PDFs sent to us)
        const attachments: Array<{ content?: string; base64Data?: string; type?: string; mimeType?: string; filename?: string; name?: string }> =
          payload.attachments ?? payload.media ?? [];
        const firstMedia = attachments[0] ?? null;

        await prisma.message.create({
          data: {
            phoneNumber: sender,
            messageBody: message,
            direction: 'inbound',
            sentTime: receivedTime,
            isRead: false,
            ...(firstMedia ? {
              mediaData: firstMedia.content ?? firstMedia.base64Data ?? null,
              mediaType: firstMedia.type ?? firstMedia.mimeType ?? null,
              mediaName: firstMedia.filename ?? firstMedia.name ?? null,
            } : {}),
          },
        });
      }

      return NextResponse.json({ ok: true });
    }

    if (event === 'sms:sent' || event === 'sms:delivered' || event === 'sms:failed') {
      const statusMap: Record<string, string> = {
        'sms:sent': 'sent',
        'sms:delivered': 'delivered',
        'sms:failed': 'failed',
      };
      const newStatus = statusMap[event];
      const order = ['pending', 'sent', 'delivered', 'failed'];

      // Try to find message by gatewayId first, then fall back to most recent
      // outbound message to this phone number (within last 10 minutes)
      const gatewayId: string = payload.id ?? '';
      const phoneNumber: string = payload.phoneNumber ?? '';

      let existing: { id: number; status: string | null } | null = null;

      if (gatewayId) {
        existing = await prisma.message.findFirst({
          where: { gatewayId },
          select: { id: true, status: true },
        });
      }

      // Fallback: match by phone + recent outbound if gatewayId didn't resolve
      if (!existing && phoneNumber) {
        const digits = phoneNumber.replace(/\D/g, '');
        existing = await prisma.message.findFirst({
          where: {
            OR: [
              { phoneNumber: digits },
              { phoneNumber: `+${digits}` },
              { phoneNumber: `+1${digits}` },
              { phoneNumber: digits.startsWith('1') ? digits.slice(1) : `1${digits}` },
            ],
            direction: 'outbound',
            sentTime: { gte: new Date(Date.now() - 10 * 60 * 1000) },
          },
          orderBy: { sentTime: 'desc' },
          select: { id: true, status: true },
        });
      }

      if (existing) {
        const currentRank = order.indexOf(existing.status ?? 'pending');
        const newRank = order.indexOf(newStatus);
        if (newRank > currentRank || newStatus === 'failed') {
          await prisma.message.update({
            where: { id: existing.id },
            data: { status: newStatus },
          });
        }
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('SMS webhook error:', error);
    return NextResponse.json({ ok: true });
  }
}
