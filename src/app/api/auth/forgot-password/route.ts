import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { forgotPasswordSchema } from '@/lib/validators';
import { sendEmail } from '@/lib/email';
import crypto from 'crypto';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const DEFAULT_APP_URL = 'https://yourdebtcollectors.com';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 3 attempts per 15 minutes per IP
    const ip = getClientIp(request);
    const limiter = rateLimit(`forgot-pw:${ip}`, 3, 15 * 60 * 1000);
    if (!limiter.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 },
      );
    }

    const body = await request.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { email } = parsed.data;

    // Look up user — but always return success to prevent email enumeration
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store token and expiry on the user record
      await prisma.user.update({
        where: { idUser: user.idUser },
        data: { resetToken, resetExpires },
      });

      // Build reset link
      const baseUrl = (process.env.AUTH_URL || DEFAULT_APP_URL).replace(/\/+$/, '');
      const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

      // Send email
      await sendEmail({
        to: [{ email: user.email!, name: user.name || 'User' }],
        subject: 'PulseBC - Reset Your Password',
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06);">
        <tr><td style="height: 4px; background: linear-gradient(90deg, #0891b2 0%, #06b6d4 50%, #22d3ee 100%);"></td></tr>
        <tr>
          <td style="padding: 32px 40px 24px 40px; text-align: center;">
            <table cellpadding="0" cellspacing="0" style="margin: 0 auto;"><tr>
              <td style="vertical-align: middle; padding-right: 10px;"><img src="https://yourdebtcollectors.com/icon-192.png" height="40" width="40" style="display: block; border-radius: 8px;"></td>
              <td style="vertical-align: middle;"><span style="font-size: 20px; font-weight: 700; color: #0f172a; font-family: 'Inter', Arial, sans-serif;">Pulse<span style="color: #0891b2;">BC</span></span></td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding: 0 40px 24px 40px; text-align: center;">
            <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #0f172a; font-family: 'Inter', Arial, sans-serif;">Reset Your Password</h1>
            <p style="margin: 0; font-size: 15px; color: #64748b; line-height: 1.6; font-family: 'Inter', Arial, sans-serif;">
              We received a request to reset the password for your account. Click the button below to set a new password. This link expires in 1 hour.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 0 40px 32px 40px; text-align: center;">
            <a href="${resetLink}" style="display: inline-block; padding: 14px 40px; background-color: #0891b2; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 10px; font-family: 'Inter', Arial, sans-serif;">Reset Password</a>
          </td>
        </tr>
        <tr>
          <td style="padding: 0 40px 24px 40px; text-align: center;">
            <p style="margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.5; font-family: 'Inter', Arial, sans-serif;">
              If you didn't request a password reset, you can safely ignore this email. Your password will not change.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 16px 40px 24px 40px; border-top: 1px solid #f1f5f9;">
            <p style="margin: 0; text-align: center; font-size: 11px; color: #94a3b8; font-family: 'Inter', Arial, sans-serif;">This is an automated notification from PulseBC Calling System.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      });
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({
      message:
        "If an account with that email exists, we've sent a password reset link.",
    });
  } catch (error) {
    console.error('POST /api/auth/forgot-password error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
