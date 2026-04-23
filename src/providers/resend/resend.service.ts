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
      this.logger.warn(`RESEND_API_KEY missing — skipping email to ${to}`);
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

export function passwordResetEmailHtml(opts: { name: string; link: string }): string {
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
              <p style="margin:0;font-size:15px;color:#3f3f46;">Hi <strong>${opts.name}</strong>,</p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:28px;">
              <p style="margin:0;font-size:15px;color:#52525b;line-height:1.6;">We received a request to reset your password. Click the button below to set a new one. This link expires in 1 hour.</p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:28px;" align="center">
              <a href="${opts.link}"
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
              <p style="margin:0;font-size:12px;color:#a1a1aa;">Or copy this link: ${opts.link}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
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
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${opts.subject}</title>
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
              <p style="margin:0;font-size:15px;color:#3f3f46;">Hi <strong>${opts.name}</strong>,</p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:28px;">
              <p style="margin:0;font-size:15px;color:#52525b;line-height:1.6;">${opts.action}</p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:28px;" align="center">
              <a href="${opts.link}"
                 style="display:inline-block;background:#6366f1;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">
                Verify email address
              </a>
            </td>
          </tr>
          ${opts.note ? `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:13px;color:#a1a1aa;">${opts.note}</p></td></tr>` : ''}
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
