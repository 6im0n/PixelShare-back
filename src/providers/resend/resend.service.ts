import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

type SendArgs = { to: string; subject: string; html: string; from?: string };

@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);
  private readonly client: Resend | null;
  private readonly defaultFrom: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('RESEND_API_KEY');
    this.defaultFrom = config.get<string>('RESEND_FROM') ?? 'PixelShare <noreply@pixelshare.local>';
    this.client = apiKey ? new Resend(apiKey) : null;
  }

  async send({ to, subject, html, from }: SendArgs): Promise<void> {
    if (!this.client) {
      this.logger.warn('RESEND_API_KEY missing — skipping outbound email');
      return;
    }
    if (/[\r\n]/.test(to) || /[\r\n]/.test(subject)) {
      this.logger.error('refusing to send email with CRLF in recipient or subject');
      return;
    }
    const { error } = await this.client.emails.send({
      from: from ?? this.defaultFrom,
      to,
      subject,
      html,
    });
    if (error) {
      this.logger.error(`Resend error: ${error.message}`);
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(value: string): string {
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '#';
    return escapeHtml(u.toString());
  } catch {
    return '#';
  }
}

export function passwordResetEmailHtml(opts: { name: string; link: string }): string {
  const name = escapeHtml(opts.name);
  const link = safeUrl(opts.link);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your PixelShare password</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:40px 36px;box-shadow:0 1px 4px rgba(0,0,0,.08);" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-bottom:24px;border-bottom:1px solid #e4e4e7;">
              <span style="font-size:20px;font-weight:800;letter-spacing:-.02em;color:#18181b;">PixelShare</span>
            </td>
          </tr>
          <tr>
            <td style="padding-top:28px;padding-bottom:8px;">
              <p style="margin:0;font-size:15px;color:#3f3f46;">Hi <strong>${name}</strong>,</p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:28px;">
              <p style="margin:0;font-size:15px;color:#52525b;line-height:1.6;">We received a request to reset your password. Click the button below to set a new one. This link expires in 1 hour.</p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:28px;" align="center">
              <a href="${link}"
                 style="display:inline-block;background:#6366f1;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">
                Reset password
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:20px;">
              <p style="margin:0;font-size:13px;color:#a1a1aa;">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
            </td>
          </tr>
          <tr>
            <td style="padding-top:20px;border-top:1px solid #e4e4e7;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">Or copy this link: ${link}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function photographerSelectionEmailHtml(opts: {
  clientName: string;
  photographerName: string;
  libraryName: string;
  link: string;
}): string {
  const clientName = escapeHtml(opts.clientName);
  const photographerName = escapeHtml(opts.photographerName);
  const libraryName = escapeHtml(opts.libraryName);
  const link = safeUrl(opts.link);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>New photos from ${photographerName}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:40px 36px;box-shadow:0 1px 4px rgba(0,0,0,.08);" cellpadding="0" cellspacing="0">
        <tr><td style="padding-bottom:24px;border-bottom:1px solid #e4e4e7;">
          <span style="font-size:20px;font-weight:800;letter-spacing:-.02em;color:#18181b;">PixelShare</span>
        </td></tr>
        <tr><td style="padding-top:28px;padding-bottom:8px;">
          <p style="margin:0;font-size:15px;color:#3f3f46;">Hi <strong>${clientName}</strong>,</p>
        </td></tr>
        <tr><td style="padding-bottom:28px;">
          <p style="margin:0;font-size:15px;color:#52525b;line-height:1.6;"><strong>${photographerName}</strong> sent you a new photo selection in <strong>${libraryName}</strong>. Open the library to browse, rate, and pick your favorites.</p>
        </td></tr>
        <tr><td style="padding-bottom:28px;" align="center">
          <a href="${link}" style="display:inline-block;background:#6366f1;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">Open library</a>
        </td></tr>
        <tr><td style="padding-top:20px;border-top:1px solid #e4e4e7;">
          <p style="margin:0;font-size:12px;color:#a1a1aa;">Or copy this link: ${link}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function clientSelectionEmailHtml(opts: {
  photographerName: string;
  clientName: string;
  libraryName: string;
  selectedCount: number;
  totalCount: number;
  link: string;
}): string {
  const photographerName = escapeHtml(opts.photographerName);
  const clientName = escapeHtml(opts.clientName);
  const libraryName = escapeHtml(opts.libraryName);
  const selectedCount = Number(opts.selectedCount);
  const totalCount = Number(opts.totalCount);
  const link = safeUrl(opts.link);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>${clientName} finished their selection</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:40px 36px;box-shadow:0 1px 4px rgba(0,0,0,.08);" cellpadding="0" cellspacing="0">
        <tr><td style="padding-bottom:24px;border-bottom:1px solid #e4e4e7;">
          <span style="font-size:20px;font-weight:800;letter-spacing:-.02em;color:#18181b;">PixelShare</span>
        </td></tr>
        <tr><td style="padding-top:28px;padding-bottom:8px;">
          <p style="margin:0;font-size:15px;color:#3f3f46;">Hi <strong>${photographerName}</strong>,</p>
        </td></tr>
        <tr><td style="padding-bottom:28px;">
          <p style="margin:0;font-size:15px;color:#52525b;line-height:1.6;"><strong>${clientName}</strong> submitted their selection in <strong>${libraryName}</strong>: <strong>${selectedCount} / ${totalCount}</strong> photos selected.</p>
        </td></tr>
        <tr><td style="padding-bottom:28px;" align="center">
          <a href="${link}" style="display:inline-block;background:#6366f1;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">Review selection</a>
        </td></tr>
        <tr><td style="padding-top:20px;border-top:1px solid #e4e4e7;">
          <p style="margin:0;font-size:12px;color:#a1a1aa;">Or copy this link: ${link}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function invitationEmailHtml(opts: {
  name: string;
  inviterName: string;
  code: string;
  link: string;
}): string {
  const name = escapeHtml(opts.name);
  const inviterName = escapeHtml(opts.inviterName);
  const code = escapeHtml(opts.code);
  const link = safeUrl(opts.link);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're invited to PixelShare</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:40px 36px;box-shadow:0 1px 4px rgba(0,0,0,.08);" cellpadding="0" cellspacing="0">
        <tr><td style="padding-bottom:24px;border-bottom:1px solid #e4e4e7;">
          <span style="font-size:20px;font-weight:800;letter-spacing:-.02em;color:#18181b;">PixelShare</span>
        </td></tr>
        <tr><td style="padding-top:28px;padding-bottom:8px;">
          <p style="margin:0;font-size:15px;color:#3f3f46;">Hi <strong>${name}</strong>,</p>
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <p style="margin:0;font-size:15px;color:#52525b;line-height:1.6;"><strong>${inviterName}</strong> invited you to join PixelShare. Click the button below to create your account.</p>
        </td></tr>
        <tr><td style="padding-bottom:24px;" align="center">
          <a href="${link}" style="display:inline-block;background:#6366f1;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">Create my account</a>
        </td></tr>
        <tr><td style="padding-bottom:24px;" align="center">
          <p style="margin:0 0 4px 0;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.08em;">Your invitation code</p>
          <p style="margin:0;font-size:22px;font-weight:700;letter-spacing:.18em;color:#18181b;font-family:'SFMono-Regular',Menlo,Consolas,monospace;">${code}</p>
        </td></tr>
        <tr><td style="padding-bottom:16px;">
          <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6;">This invitation is single-use and expires in 7 days. If you didn't expect this, you can ignore the email.</p>
        </td></tr>
        <tr><td style="padding-top:20px;border-top:1px solid #e4e4e7;">
          <p style="margin:0;font-size:12px;color:#a1a1aa;">Or copy this link: ${link}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function verificationEmailHtml(opts: {
  name: string;
  link: string;
  subject: string;
  action: string;
  note?: string;
}): string {
  const name = escapeHtml(opts.name);
  const link = safeUrl(opts.link);
  const subject = escapeHtml(opts.subject);
  const action = escapeHtml(opts.action);
  const note = opts.note ? escapeHtml(opts.note) : undefined;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:40px 36px;box-shadow:0 1px 4px rgba(0,0,0,.08);" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-bottom:24px;border-bottom:1px solid #e4e4e7;">
              <span style="font-size:20px;font-weight:800;letter-spacing:-.02em;color:#18181b;">PixelShare</span>
            </td>
          </tr>
          <tr>
            <td style="padding-top:28px;padding-bottom:8px;">
              <p style="margin:0;font-size:15px;color:#3f3f46;">Hi <strong>${name}</strong>,</p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:28px;">
              <p style="margin:0;font-size:15px;color:#52525b;line-height:1.6;">${action}</p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:28px;" align="center">
              <a href="${link}"
                 style="display:inline-block;background:#6366f1;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">
                Verify email address
              </a>
            </td>
          </tr>
          ${note ? `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:13px;color:#a1a1aa;">${note}</p></td></tr>` : ''}
          <tr>
            <td style="padding-top:20px;border-top:1px solid #e4e4e7;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
