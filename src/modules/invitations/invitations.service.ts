import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DrizzleService } from '../../providers/drizzle/drizzle.service';
import type { DrizzleClient } from '../../providers/drizzle/drizzle.provider';
import {
  invitations,
  libraries,
  libraryClients,
  libraryInvitations,
  users,
  type Invitation,
} from '../../providers/drizzle/schema/schema';
import { ResendService, invitationEmailHtml } from '../../providers/resend/resend.service';
import type { AuthUser } from '../../shared/types';
import type { CreateInvitationDto } from './dto/invitations.dto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const EXPIRY_DAYS = 7;
const MAX_CODE_TRIES = 8;

@Injectable()
export class InvitationsService {
  private readonly frontendUrl: string;

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly resend: ResendService,
    private readonly config: ConfigService,
  ) {
    this.frontendUrl =
      this.config.get<string>('FRONTEND_OAUTH_REDIRECT')?.replace('/oauth/callback', '') ??
      this.config.get<string>('PUBLIC_URL') ??
      'http://localhost:3000';
  }

  async create(actor: AuthUser, dto: CreateInvitationDto) {
    const email = dto.email.toLowerCase().trim();

    const existingUser = await this.drizzle.findUserByEmail(email);
    if (existingUser) {
      throw new BadRequestException('a user with this email already exists');
    }

    const pending = await this.findActiveByEmail(email);
    if (pending) {
      throw new BadRequestException('a pending invitation already exists for this email');
    }

    if (dto.libraryIds?.length) {
      await this.assertOwnsLibraries(actor, dto.libraryIds);
    }

    const code = await this.allocateCode();
    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const [row] = await this.drizzle.db
      .insert(invitations)
      .values({
        code,
        email,
        name: dto.name.trim(),
        invitedByUserId: actor.id,
        expiresAt,
      })
      .returning();
    if (!row) throw new BadRequestException('failed to create invitation');

    if (dto.libraryIds?.length) {
      await this.drizzle.db
        .insert(libraryInvitations)
        .values(dto.libraryIds.map((libraryId) => ({ libraryId, invitationId: row.id })))
        .onConflictDoNothing();
    }

    await this.sendInvitationEmail(row, actor.name);
    return this.serialize(row);
  }

  async list(actor: AuthUser) {
    const baseSelect = {
      id: invitations.id,
      email: invitations.email,
      name: invitations.name,
      code: invitations.code,
      invitedByUserId: invitations.invitedByUserId,
      invitedByName: users.name,
      createdAt: invitations.createdAt,
      expiresAt: invitations.expiresAt,
      consumedAt: invitations.consumedAt,
      consumedByUserId: invitations.consumedByUserId,
      revokedAt: invitations.revokedAt,
    };

    const rows =
      actor.role === 'admin'
        ? await this.drizzle.db
            .select(baseSelect)
            .from(invitations)
            .innerJoin(users, eq(users.id, invitations.invitedByUserId))
            .orderBy(desc(invitations.createdAt))
        : await this.drizzle.db
            .select(baseSelect)
            .from(invitations)
            .innerJoin(users, eq(users.id, invitations.invitedByUserId))
            .where(eq(invitations.invitedByUserId, actor.id))
            .orderBy(desc(invitations.createdAt));

    return rows.map((r) => ({
      ...r,
      status: this.statusOf(r),
    }));
  }

  async resendInvitation(id: string, actor: AuthUser) {
    const row = await this.requireInvitation(id);
    this.assertActorCanManage(row, actor);
    if (row.consumedAt) throw new BadRequestException('invitation already used');
    if (row.revokedAt) throw new BadRequestException('invitation revoked');

    const expired = row.expiresAt < new Date();
    let updated: Invitation = row;

    if (expired) {
      const newExpiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      const [next] = await this.drizzle.db
        .update(invitations)
        .set({ expiresAt: newExpiresAt })
        .where(eq(invitations.id, row.id))
        .returning();
      if (!next) throw new BadRequestException('failed to refresh invitation');
      updated = next;
    }

    await this.sendInvitationEmail(updated, actor.name);
    return { ok: true };
  }

  async addLibrary(id: string, libraryId: string, actor: AuthUser) {
    const row = await this.requireInvitation(id);
    this.assertActorCanManage(row, actor);
    if (row.consumedAt) throw new BadRequestException('invitation already used');
    if (row.revokedAt) throw new BadRequestException('invitation revoked');
    if (row.expiresAt < new Date()) throw new BadRequestException('invitation expired');

    await this.assertOwnsLibraries(actor, [libraryId]);

    await this.drizzle.db
      .insert(libraryInvitations)
      .values({ libraryId, invitationId: id })
      .onConflictDoNothing();

    return { ok: true };
  }

  async revoke(id: string, actor: AuthUser) {
    const row = await this.requireInvitation(id);
    this.assertActorCanManage(row, actor);
    if (row.consumedAt) throw new BadRequestException('invitation already used');
    if (row.revokedAt) return { ok: true };

    await this.drizzle.db
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(eq(invitations.id, id));
    return { ok: true };
  }

  async lookup(code: string) {
    const row = await this.findActiveByCode(code);
    if (!row) throw new NotFoundException('invitation not found or no longer valid');
    return { email: row.email, name: row.name };
  }

  async consume(
    args: { code: string; userId: string; email: string },
    client: DrizzleClient = this.drizzle.db,
  ): Promise<void> {
    const row = await this.findActiveByCode(args.code);
    if (!row) throw new BadRequestException('invitation invalid or expired');
    if (row.email.toLowerCase() !== args.email.toLowerCase()) {
      throw new BadRequestException('email does not match invitation');
    }

    const [updated] = await client
      .update(invitations)
      .set({ consumedAt: new Date(), consumedByUserId: args.userId })
      .where(
        and(
          eq(invitations.id, row.id),
          isNull(invitations.consumedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .returning({ id: invitations.id });

    if (!updated) throw new BadRequestException('invitation already used');

    const links = await client
      .select({ libraryId: libraryInvitations.libraryId })
      .from(libraryInvitations)
      .where(eq(libraryInvitations.invitationId, row.id));

    if (links.length > 0) {
      await client
        .insert(libraryClients)
        .values(links.map((l) => ({ libraryId: l.libraryId, clientId: args.userId })))
        .onConflictDoNothing();

      await client
        .delete(libraryInvitations)
        .where(eq(libraryInvitations.invitationId, row.id));
    }
  }

  async pendingLibraryMembers(libraryId: string) {
    return this.drizzle.db
      .select({
        invitationId: invitations.id,
        email: invitations.email,
        name: invitations.name,
        createdAt: libraryInvitations.grantedAt,
      })
      .from(libraryInvitations)
      .innerJoin(invitations, eq(invitations.id, libraryInvitations.invitationId))
      .where(
        and(
          eq(libraryInvitations.libraryId, libraryId),
          isNull(invitations.consumedAt),
          isNull(invitations.revokedAt),
        ),
      );
  }

  private async assertOwnsLibraries(actor: AuthUser, libraryIds: string[]) {
    for (const id of libraryIds) {
      const lib = await this.drizzle.requireLibrary(id);
      if (actor.role !== 'admin' && lib.photographerId !== actor.id) {
        throw new ForbiddenException(`not your library: ${id}`);
      }
    }
  }

  private assertActorCanManage(row: Invitation, actor: AuthUser) {
    if (actor.role === 'admin') return;
    if (row.invitedByUserId !== actor.id) {
      throw new ForbiddenException('not your invitation');
    }
  }

  private async requireInvitation(id: string): Promise<Invitation> {
    const [row] = await this.drizzle.db
      .select()
      .from(invitations)
      .where(eq(invitations.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('invitation not found');
    return row;
  }

  private async findActiveByCode(code: string): Promise<Invitation | null> {
    const [row] = await this.drizzle.db
      .select()
      .from(invitations)
      .where(eq(invitations.code, code.toUpperCase()))
      .limit(1);
    if (!row) return null;
    if (row.consumedAt || row.revokedAt) return null;
    if (row.expiresAt < new Date()) return null;
    return row;
  }

  private async findActiveByEmail(email: string): Promise<Invitation | null> {
    const rows = await this.drizzle.db
      .select()
      .from(invitations)
      .where(eq(invitations.email, email));
    return (
      rows.find((r) => !r.consumedAt && !r.revokedAt && r.expiresAt > new Date()) ?? null
    );
  }

  private async allocateCode(): Promise<string> {
    for (let i = 0; i < MAX_CODE_TRIES; i++) {
      const candidate = this.generateCode();
      const [hit] = await this.drizzle.db
        .select({ id: invitations.id })
        .from(invitations)
        .where(eq(invitations.code, candidate))
        .limit(1);
      if (!hit) return candidate;
    }
    throw new BadRequestException('could not allocate invitation code');
  }

  private generateCode(): string {
    const bytes = randomBytes(CODE_LENGTH);
    let out = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
    }
    return out;
  }

  private async sendInvitationEmail(row: Invitation, inviterName: string) {
    const link = `${this.frontendUrl}/register?code=${row.code}`;
    try {
      await this.resend.send({
        to: row.email,
        subject: `${inviterName} invited you to PixelShare`,
        html: invitationEmailHtml({
          name: row.name,
          inviterName,
          code: row.code,
          link,
        }),
      });
    } catch {
      // non-blocking
    }
  }

  private statusOf(row: { consumedAt: Date | null; revokedAt: Date | null; expiresAt: Date }) {
    if (row.consumedAt) return 'consumed';
    if (row.revokedAt) return 'revoked';
    if (row.expiresAt < new Date()) return 'expired';
    return 'pending';
  }

  private serialize(row: Invitation) {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      code: row.code,
      invitedByUserId: row.invitedByUserId,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
      consumedByUserId: row.consumedByUserId,
      revokedAt: row.revokedAt,
      status: this.statusOf(row),
    };
  }
}

// Re-export to be consumable by libraries module (orange-badge listings)
export type { Invitation };
