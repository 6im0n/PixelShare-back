import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../../providers/drizzle/drizzle.service';
import { photos } from '../../providers/drizzle/schema/schema';
import type { AuthUser } from '../../shared/types';

export type UploadInput = {
  buffer: Buffer;
  originalName: string;
};

@Injectable()
export class PhotosService {
  private readonly storagePath: string;

  constructor(
    private readonly drizzle: DrizzleService,
    config: ConfigService,
  ) {
    this.storagePath = resolve(config.get<string>('STORAGE_PATH') ?? './storage');
  }

  async listByLibrary(libraryId: string, user: AuthUser) {
    if (!(await this.drizzle.canAccessLibrary(libraryId, user.id, user.role))) {
      throw new ForbiddenException('no access');
    }
    return this.drizzle.db.select().from(photos).where(eq(photos.libraryId, libraryId));
  }

  async upload(libraryId: string, user: AuthUser, file: UploadInput) {
    const lib = await this.drizzle.requireLibrary(libraryId);
    if (user.role !== 'admin' && lib.photographerId !== user.id) {
      throw new ForbiddenException('only owner can upload');
    }
    if (!file.buffer?.length) throw new BadRequestException('empty file');

    const id = randomUUID();
    const ext = (extname(file.originalName) || '.jpg').toLowerCase();
    const originalsDir = join(this.storagePath, 'originals', libraryId);
    const thumbsDir = join(this.storagePath, 'thumbnails', libraryId);
    await mkdir(originalsDir, { recursive: true });
    await mkdir(thumbsDir, { recursive: true });

    const originalPath = join(originalsDir, `${id}${ext}`);
    const thumbnailPath = join(thumbsDir, `${id}.webp`);

    await writeFile(originalPath, file.buffer);

    const image = sharp(file.buffer);
    const meta = await image.metadata();
    await image.resize({ width: 800, withoutEnlargement: true }).webp({ quality: 80 }).toFile(thumbnailPath);

    const [row] = await this.drizzle.db
      .insert(photos)
      .values({
        id,
        libraryId,
        name: file.originalName,
        originalPath,
        thumbnailPath,
        width: meta.width ?? null,
        height: meta.height ?? null,
        byteSize: file.buffer.length,
      })
      .returning();
    if (!row) throw new BadRequestException('insert failed');
    return row;
  }

  async remove(photoId: string, user: AuthUser) {
    const photo = await this.drizzle.requirePhoto(photoId);
    const lib = await this.drizzle.requireLibrary(photo.libraryId);
    if (user.role !== 'admin' && lib.photographerId !== user.id) {
      throw new ForbiddenException('not your photo');
    }
    await this.drizzle.db.delete(photos).where(eq(photos.id, photoId));
    await Promise.allSettled([unlink(photo.originalPath), unlink(photo.thumbnailPath)]);
    return { deleted: true };
  }

  async readFileForUser(
    photoId: string,
    user: AuthUser,
    kind: 'original' | 'thumbnail',
  ): Promise<{ buffer: Buffer; mime: string; name: string }> {
    const photo = await this.drizzle.requirePhoto(photoId);
    if (!(await this.drizzle.canAccessLibrary(photo.libraryId, user.id, user.role))) {
      throw new ForbiddenException('no access');
    }
    const path = kind === 'original' ? photo.originalPath : photo.thumbnailPath;
    let buffer: Buffer;
    try {
      buffer = await readFile(path);
    } catch {
      throw new NotFoundException('file missing on disk');
    }
    const mime = kind === 'thumbnail' ? 'image/webp' : guessMime(photo.name);
    return { buffer, mime, name: photo.name };
  }
}

function guessMime(name: string): string {
  const ext = extname(name).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.heic':
      return 'image/heic';
    default:
      return 'application/octet-stream';
  }
}
