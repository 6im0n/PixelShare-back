import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { DrizzleService } from '../../providers/drizzle/drizzle.service';
import { passwordResetTokens, users, type User } from '../../providers/drizzle/schema/schema';
import {
  ResendService,
  passwordResetEmailHtml,
  verificationEmailHtml,
} from '../../providers/resend/resend.service';
import { InvitationsService } from '../invitations/invitations.service';
import { hashPassword, verifyPassword } from '../../shared/password.util';
import type { AuthUser, JwtPayload } from '../../shared/types';
import type { AuthTokens, ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly accessTtlSec: number;
  private readonly refreshTtlSec: number;
  private readonly refreshSecret: string;

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly resend: ResendService,
    private readonly invitations: InvitationsService,
  ) {
    this.accessTtlSec = parseTtlSeconds(config.get<string>('JWT_ACCESS_TTL') ?? '15m');
    this.refreshTtlSec = parseTtlSeconds(config.get<string>('JWT_REFRESH_TTL') ?? '30d');
    this.refreshSecret =
      config.get<string>('JWT_REFRESH_SECRET') ?? config.getOrThrow<string>('JWT_SECRET');
  }

  async register(dto: RegisterDto): Promise<AuthTokens & { user: AuthUser }> {
    const email = dto.email.toLowerCase();
    const existing = await this.drizzle.findUserByEmail(email);
    if (existing) throw new ConflictException('email already registered');

    const code = dto.invitationCode.toUpperCase();

    const passwordHash = await hashPassword(dto.password);

    const user = await this.drizzle.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({ email, name: dto.name, passwordHash, role: 'client' })
        .returning();
      if (!created) throw new BadRequestException('failed to create user');
      await this.invitations.consume({ code, userId: created.id, email }, tx);
      return created;
    });

    const token = randomUUID();
    await this.drizzle.db
      .update(users)
      .set({ emailVerificationToken: token })
      .where(eq(users.id, user.id));

    const frontendUrl =
      this.config.get<string>('FRONTEND_OAUTH_REDIRECT')?.replace('/oauth/callback', '') ??
      'http://localhost:3000';

    try {
      await this.sendVerificationEmail(user, token, frontendUrl);
    } catch {
      // do not let email failure block registration
    }

    return this.issue(user);
  }

  async login(dto: LoginDto): Promise<AuthTokens & { user: AuthUser }> {
    const user = await this.drizzle.findUserByEmail(dto.email);
    if (!user || !user.passwordHash) throw new UnauthorizedException('invalid credentials');
    const ok = await verifyPassword(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('invalid credentials');
    await this.drizzle.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));
    return this.issue(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens & { user: AuthUser }> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.refreshSecret,
        algorithms: ['HS256'],
        issuer: 'pixelshare',
      });
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('wrong token type');
    const user = await this.drizzle.findUserById(payload.sub);
    if (!user) throw new UnauthorizedException('user gone');
    return this.issue(user);
  }

  async issue(user: User): Promise<AuthTokens & { user: AuthUser }> {
    const base: Omit<JwtPayload, 'type'> = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    const accessToken = await this.jwt.signAsync(
      { ...base, type: 'access' },
      { expiresIn: this.accessTtlSec },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...base, type: 'refresh' },
      { secret: this.refreshSecret, expiresIn: this.refreshTtlSec },
    );
    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTtlSec,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  async verifyEmailToken(token: string): Promise<{ ok: boolean }> {
    if (!token) throw new BadRequestException('missing token');
    const [user] = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.emailVerificationToken, token))
      .limit(1);
    if (!user) throw new BadRequestException('invalid or expired token');

    const patch: Partial<typeof users.$inferInsert> = {
      emailVerified: true,
      emailVerificationToken: null,
      updatedAt: new Date(),
    };

    // Email-change flow: pendingEmail set means swap the address
    if (user.pendingEmail) {
      const conflict = await this.drizzle.findUserByEmail(user.pendingEmail);
      if (conflict && conflict.id !== user.id) {
        throw new BadRequestException('email already taken');
      }
      patch.email = user.pendingEmail;
      patch.pendingEmail = null;
    }

    await this.drizzle.db.update(users).set(patch).where(eq(users.id, user.id));
    return { ok: true };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ ok: boolean }> {
    const email = dto.email.toLowerCase();
    const user = await this.drizzle.findUserByEmail(email);

    // Always return ok to not leak user existence
    if (!user || !user.passwordHash) return { ok: true };

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const [recent] = await this.drizzle.db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          gt(passwordResetTokens.createdAt, tenMinutesAgo),
        ),
      )
      .limit(1);

    if (recent) {
      throw new HttpException(
        'Please wait 10 minutes before requesting another reset email',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Clean old tokens then insert new one
    await this.drizzle.db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.drizzle.db
      .insert(passwordResetTokens)
      .values({ userId: user.id, token, expiresAt });

    const frontendUrl =
      this.config.get<string>('FRONTEND_OAUTH_REDIRECT')?.replace('/oauth/callback', '') ??
      'http://localhost:3000';

    try {
      const link = `${frontendUrl}/reset-password?token=${token}`;
      await this.resend.send({
        to: user.email,
        subject: 'Reset your PixelShare password',
        html: passwordResetEmailHtml({ name: user.name, link }),
      });
    } catch {
      // do not let email failure surface to caller
    }

    return { ok: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ ok: boolean }> {
    const [row] = await this.drizzle.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, dto.token))
      .limit(1);

    if (!row || row.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset link');
    }

    const passwordHash = await hashPassword(dto.password);
    await this.drizzle.db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, row.userId));

    await this.drizzle.db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, row.userId));

    return { ok: true };
  }

  private async sendVerificationEmail(user: User, token: string, frontendUrl: string) {
    const link = `${frontendUrl}/verify-email?token=${token}`;
    await this.resend.send({
      to: user.email,
      subject: 'Verify your PixelShare email',
      html: verificationEmailHtml({
        name: user.name,
        link,
        subject: 'Verify your PixelShare email',
        action: 'Please verify your email address to complete your PixelShare registration.',
        note: `Or copy this link: ${link}`,
      }),
    });
  }
}

function parseTtlSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 900;
  const n = Number(match[1]);
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return n * mult;
}
