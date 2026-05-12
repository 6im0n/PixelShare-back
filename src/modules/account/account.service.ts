import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, eq, ne, sql } from 'drizzle-orm';
import { ConfigService } from '@nestjs/config';
import { DrizzleService } from '../../providers/drizzle/drizzle.service';
import { ResendService, verificationEmailHtml } from '../../providers/resend/resend.service';
import { users, libraries, libraryClients } from '../../providers/drizzle/schema/schema';
import { hashPassword, verifyPassword } from '../../shared/password.util';
import type { UpdateMeDto, UpdateUserDto, RequestEmailChangeDto } from './dto/account.dto';

@Injectable()
export class AccountService {
  private readonly frontendUrl: string;

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly resend: ResendService,
    private readonly config: ConfigService,
  ) {
    this.frontendUrl =
      this.config.get<string>('FRONTEND_OAUTH_REDIRECT')?.replace('/oauth/callback', '') ??
      'http://localhost:3000';
  }

  async getMe(userId: string) {
    const user = await this.drizzle.requireUser(userId);
    return sanitize(user);
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const user = await this.drizzle.requireUser(userId);
    const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

    if (dto.name !== undefined) patch.name = dto.name;

    if (dto.password !== undefined) {
      if (!dto.currentPassword) throw new BadRequestException('current password required');
      if (!user.passwordHash) throw new BadRequestException('no password set on this account');
      const ok = await verifyPassword(user.passwordHash, dto.currentPassword);
      if (!ok) throw new UnauthorizedException('current password incorrect');
      patch.passwordHash = await hashPassword(dto.password);
    }

    const [row] = await this.drizzle.db
      .update(users)
      .set(patch)
      .where(eq(users.id, userId))
      .returning();
    if (!row) throw new NotFoundException('user not found');
    return sanitize(row);
  }

  async requestEmailChange(userId: string, dto: RequestEmailChangeDto) {
    const newEmail = dto.email.toLowerCase();
    const token = randomUUID();

    try {
      await this.drizzle.db.transaction(async (tx) => {
        const [clash] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, newEmail), ne(users.id, userId)))
          .limit(1);
        if (clash) throw new BadRequestException('email already in use');

        await tx
          .update(users)
          .set({
            pendingEmail: newEmail,
            emailVerificationToken: token,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      });
    } catch (err) {
      const pg = err as { code?: string };
      if (pg.code === '23505') throw new BadRequestException('email already in use');
      throw err;
    }

    const link = `${this.frontendUrl}/verify-email?token=${token}`;
    try {
      const user = await this.drizzle.requireUser(userId);
      await this.resend.send({
        to: newEmail,
        subject: 'Confirm your new PixelShare email',
        html: verificationEmailHtml({
          name: user.name,
          link,
          subject: 'Confirm your new PixelShare email',
          action: 'You requested an email address change on PixelShare. Click below to confirm your new address.',
          note: `Or copy this link: ${link}`,
        }),
      });
    } catch {
      // email failure non-blocking
    }

    return { ok: true, message: 'Verification email sent to new address.' };
  }

  async listUsers() {
    const rows = await this.drizzle.db.select().from(users);
    return rows.map(sanitize);
  }

  async listClients(actorId: string, actorRole: string) {
    if (actorRole === 'admin') {
      const rows = await this.drizzle.db
        .select()
        .from(users)
        .where(eq(users.role, 'client'));
      return rows.map(sanitize);
    }
    const rows = await this.drizzle.db
      .selectDistinct({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        emailVerified: users.emailVerified,
        pendingEmail: users.pendingEmail,
        oauthProvider: users.oauthProvider,
        oauthProviderId: users.oauthProviderId,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .innerJoin(libraryClients, eq(libraryClients.clientId, users.id))
      .innerJoin(libraries, eq(libraries.id, libraryClients.libraryId))
      .where(and(eq(libraries.photographerId, actorId), eq(users.role, 'client')));
    return rows;
  }

  async getUserLibraries(userId: string) {
    const rows = await this.drizzle.db
      .select({
        id: libraries.id,
        name: libraries.name,
        grantedAt: libraryClients.grantedAt,
      })
      .from(libraryClients)
      .innerJoin(libraries, eq(libraryClients.libraryId, libraries.id))
      .where(eq(libraryClients.clientId, userId));
    return rows;
  }

  async updateUser(userId: string, dto: UpdateUserDto) {
    const target = await this.drizzle.requireUser(userId);

    const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.role !== undefined) patch.role = dto.role;
    if (dto.password !== undefined) patch.passwordHash = await hashPassword(dto.password);

    if (
      target.role === 'admin' &&
      dto.role !== undefined &&
      dto.role !== 'admin' &&
      !(await this.hasOtherAdmin(userId))
    ) {
      throw new ConflictException('cannot demote the last remaining admin');
    }

    const [row] = await this.drizzle.db
      .update(users)
      .set(patch)
      .where(eq(users.id, userId))
      .returning();
    if (!row) throw new NotFoundException('user not found');
    return sanitize(row);
  }

  async deleteUser(userId: string) {
    const target = await this.drizzle.requireUser(userId);
    if (target.role === 'admin' && !(await this.hasOtherAdmin(userId))) {
      throw new ConflictException('cannot delete the last remaining admin');
    }
    try {
      const [row] = await this.drizzle.db.delete(users).where(eq(users.id, userId)).returning({
        id: users.id,
      });
      if (!row) throw new NotFoundException('user not found');
    } catch (err: unknown) {
      if (err instanceof NotFoundException) throw err;
      const pg = err as { code?: string };
      if (pg.code === '23503') throw new ConflictException('user has linked records; remove them first');
      throw err;
    }
    return { deleted: true };
  }

  private async hasOtherAdmin(excludeUserId: string): Promise<boolean> {
    const [row] = await this.drizzle.db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.role, 'admin'), ne(users.id, excludeUserId)));
    return (row?.count ?? 0) > 0;
  }
}

function sanitize(user: typeof users.$inferSelect) {
  const { passwordHash: _pw, emailVerificationToken: _t, ...rest } = user;
  return rest;
}
