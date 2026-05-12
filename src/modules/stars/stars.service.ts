import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DrizzleService } from '../../providers/drizzle/drizzle.service';
import {
  photos as photosTable,
  starHistory,
  stars,
  users,
} from '../../providers/drizzle/schema/schema';
import type { AuthUser } from '../../shared/types';

@Injectable()
export class StarsService {
  constructor(private readonly drizzle: DrizzleService) {}

  async setStar(photoId: string, user: AuthUser, value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 5) {
      throw new BadRequestException('star value must be an integer between 0 and 5');
    }
    const photo = await this.drizzle.requirePhoto(photoId);
    if (!(await this.drizzle.canAccessLibrary(photo.libraryId, user.id, user.role))) {
      throw new ForbiddenException('no access');
    }
    await this.drizzle.db.transaction(async (tx) => {
      if (value === 0) {
        await tx
          .delete(stars)
          .where(and(eq(stars.photoId, photoId), eq(stars.userId, user.id)));
      } else {
        await tx
          .insert(stars)
          .values({ photoId, userId: user.id, value })
          .onConflictDoUpdate({
            target: [stars.photoId, stars.userId],
            set: { value, updatedAt: new Date() },
          });
      }
      await tx.insert(starHistory).values({ photoId, userId: user.id, value });
    });
    return { photoId, value };
  }

  async listForPhoto(photoId: string, user: AuthUser) {
    const photo = await this.drizzle.requirePhoto(photoId);
    if (!(await this.drizzle.canAccessLibrary(photo.libraryId, user.id, user.role))) {
      throw new ForbiddenException('no access');
    }
    const lib = await this.drizzle.requireLibrary(photo.libraryId);
    const rows = await this.drizzle.db
      .select({
        photoId: stars.photoId,
        userId: stars.userId,
        value: stars.value,
        updatedAt: stars.updatedAt,
        userName: users.name,
        userRole: users.role,
      })
      .from(stars)
      .innerJoin(users, eq(users.id, stars.userId))
      .where(eq(stars.photoId, photoId));

    const myStars = rows.find((r) => r.userId === user.id)?.value ?? 0;
    const photographerRow = rows.find((r) => r.userId === lib.photographerId);
    return {
      photoId,
      myStars,
      photographerStars: photographerRow?.value ?? 0,
      ratings: rows,
    };
  }

  async listHistoryForPhoto(photoId: string, user: AuthUser) {
    const photo = await this.drizzle.requirePhoto(photoId);
    if (!(await this.drizzle.canAccessLibrary(photo.libraryId, user.id, user.role))) {
      throw new ForbiddenException('no access');
    }
    const rows = await this.drizzle.db
      .select({
        id: starHistory.id,
        photoId: starHistory.photoId,
        userId: starHistory.userId,
        value: starHistory.value,
        changedAt: starHistory.changedAt,
        userName: users.name,
        userRole: users.role,
      })
      .from(starHistory)
      .innerJoin(users, eq(users.id, starHistory.userId))
      .where(eq(starHistory.photoId, photoId))
      .orderBy(desc(starHistory.changedAt));
    return rows;
  }

  async clearMineForLibrary(libraryId: string, user: AuthUser) {
    if (!(await this.drizzle.canAccessLibrary(libraryId, user.id, user.role))) {
      throw new ForbiddenException('no access');
    }
    const db = this.drizzle.db;
    const userStars = await db
      .select({ photoId: stars.photoId })
      .from(stars)
      .innerJoin(photosTable, eq(photosTable.id, stars.photoId))
      .where(and(eq(stars.userId, user.id), eq(photosTable.libraryId, libraryId)));

    if (userStars.length === 0) return { cleared: 0 };

    const photoIds = userStars.map((s) => s.photoId);

    await db.transaction(async (tx) => {
      await tx
        .insert(starHistory)
        .values(photoIds.map((photoId) => ({ photoId, userId: user.id, value: 0 })));
      await tx
        .delete(stars)
        .where(and(eq(stars.userId, user.id), inArray(stars.photoId, photoIds)));
    });
    return { cleared: userStars.length };
  }

  async listForLibrary(libraryId: string, user: AuthUser) {
    if (!(await this.drizzle.canAccessLibrary(libraryId, user.id, user.role))) {
      throw new ForbiddenException('no access');
    }
    const rows = await this.drizzle.db
      .select({
        photoId: stars.photoId,
        userId: stars.userId,
        value: stars.value,
        userRole: users.role,
      })
      .from(stars)
      .innerJoin(users, eq(users.id, stars.userId))
      .innerJoin(photosTable, eq(photosTable.id, stars.photoId))
      .where(eq(photosTable.libraryId, libraryId));
    return rows;
  }
}
