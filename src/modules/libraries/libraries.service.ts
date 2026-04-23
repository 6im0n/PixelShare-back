import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { DrizzleService } from '../../providers/drizzle/drizzle.service';
import {
  libraries,
  libraryClients,
  photos,
  users,
} from '../../providers/drizzle/schema/schema';
import type { AuthUser } from '../../shared/types';
import type { CreateLibraryDto, UpdateLibraryDto } from './dto/libraries.dto';

@Injectable()
export class LibrariesService {
  private readonly storagePath: string;
  constructor(
    private readonly drizzle: DrizzleService,
    config: ConfigService,
  ) {
    this.storagePath = config.get<string>('STORAGE_PATH') ?? 'storage';
  }

  async list(user: AuthUser) {
    const db = this.drizzle.db;
    const baseSelect = {
      id: libraries.id,
      name: libraries.name,
      photographerId: libraries.photographerId,
      photographerName: users.name,
      shootDate: libraries.shootDate,
      createdAt: libraries.createdAt,
      updatedAt: libraries.updatedAt,
    };

    if (user.role === 'admin') {
      return db
        .select(baseSelect)
        .from(libraries)
        .innerJoin(users, eq(users.id, libraries.photographerId));
    }
    if (user.role === 'photographer') {
      return db
        .select(baseSelect)
        .from(libraries)
        .innerJoin(users, eq(users.id, libraries.photographerId))
        .where(eq(libraries.photographerId, user.id));
    }
    return db
      .select(baseSelect)
      .from(libraries)
      .innerJoin(users, eq(users.id, libraries.photographerId))
      .innerJoin(libraryClients, eq(libraryClients.libraryId, libraries.id))
      .where(eq(libraryClients.clientId, user.id));
  }

  async get(id: string, user: AuthUser) {
    if (!(await this.drizzle.canAccessLibrary(id, user.id, user.role))) {
      throw new ForbiddenException('no access to this library');
    }
    const [row] = await this.drizzle.db
      .select({
        id: libraries.id,
        name: libraries.name,
        photographerId: libraries.photographerId,
        photographerName: users.name,
        shootDate: libraries.shootDate,
        createdAt: libraries.createdAt,
        updatedAt: libraries.updatedAt,
      })
      .from(libraries)
      .innerJoin(users, eq(users.id, libraries.photographerId))
      .where(eq(libraries.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('library not found');
    return row;
  }

  async create(user: AuthUser, dto: CreateLibraryDto) {
    if (user.role !== 'admin' && user.role !== 'photographer') {
      throw new ForbiddenException('only photographers can create libraries');
    }
    const [row] = await this.drizzle.db
      .insert(libraries)
      .values({
        name: dto.name,
        photographerId: user.id,
        shootDate: dto.shootDate ? new Date(dto.shootDate) : null,
      })
      .returning();
    if (!row) throw new BadRequestException('create failed');
    return row;
  }

  async update(id: string, user: AuthUser, dto: UpdateLibraryDto) {
    await this.assertOwnerOrAdmin(id, user);
    const patch: Partial<typeof libraries.$inferInsert> = { updatedAt: new Date() };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.shootDate !== undefined) patch.shootDate = new Date(dto.shootDate);
    const [row] = await this.drizzle.db
      .update(libraries)
      .set(patch)
      .where(eq(libraries.id, id))
      .returning();
    if (!row) throw new NotFoundException('library not found');
    return row;
  }

  async remove(id: string, user: AuthUser) {
    await this.assertOwnerOrAdmin(id, user);
    const photoRows = await this.drizzle.db
      .select({ originalPath: photos.originalPath, thumbnailPath: photos.thumbnailPath })
      .from(photos)
      .where(eq(photos.libraryId, id));

    await this.drizzle.db.delete(libraries).where(eq(libraries.id, id));

    await Promise.allSettled(
      photoRows.flatMap((p) => [unlink(p.originalPath), unlink(p.thumbnailPath)]),
    );
    await Promise.allSettled([
      rm(join(this.storagePath, 'originals', id), { recursive: true, force: true }),
      rm(join(this.storagePath, 'thumbnails', id), { recursive: true, force: true }),
    ]);
    return { deleted: true };
  }

  async grantClient(id: string, clientId: string, user: AuthUser) {
    await this.assertOwnerOrAdmin(id, user);
    const client = await this.drizzle.requireUser(clientId);
    if (client.role !== 'client') {
      throw new BadRequestException('target user is not a client');
    }
    await this.drizzle.db
      .insert(libraryClients)
      .values({ libraryId: id, clientId })
      .onConflictDoNothing();
    return { granted: true };
  }

  async revokeClient(id: string, clientId: string, user: AuthUser) {
    await this.assertOwnerOrAdmin(id, user);
    await this.drizzle.db
      .delete(libraryClients)
      .where(and(eq(libraryClients.libraryId, id), eq(libraryClients.clientId, clientId)));
    return { revoked: true };
  }

  async listClients(id: string, user: AuthUser) {
    await this.assertOwnerOrAdmin(id, user);
    return this.drizzle.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        grantedAt: libraryClients.grantedAt,
      })
      .from(libraryClients)
      .innerJoin(users, eq(users.id, libraryClients.clientId))
      .where(eq(libraryClients.libraryId, id));
  }

  private async assertOwnerOrAdmin(libraryId: string, user: AuthUser) {
    const lib = await this.drizzle.requireLibrary(libraryId);
    if (user.role === 'admin') return lib;
    if (lib.photographerId !== user.id) {
      throw new ForbiddenException('not your library');
    }
    return lib;
  }
}
