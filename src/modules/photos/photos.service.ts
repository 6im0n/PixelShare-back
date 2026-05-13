import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { desc, eq } from 'drizzle-orm';
import { DrizzleService } from '../../providers/drizzle/drizzle.service';
import { photos } from '../../providers/drizzle/schema/schema';
import type { AuthUser } from '../../shared/types';

export type UploadInput = {
  buffer: Buffer;
  originalName: string;
};

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'heif', 'avif']);
const FORMAT_TO_EXT: Record<string, string> = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
  gif: '.gif',
  heif: '.heic',
  avif: '.avif',
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

  async listByLibrary(
    libraryId: string,
    user: AuthUser,
    page: { limit: number; offset: number } = { limit: 100, offset: 0 },
  ) {
    if (!(await this.drizzle.canAccessLibrary(libraryId, user.id, user.role))) {
      throw new ForbiddenException('no access');
    }
    return this.drizzle.db
      .select()
      .from(photos)
      .where(eq(photos.libraryId, libraryId))
      .orderBy(desc(photos.uploadedAt))
      .limit(Math.min(page.limit, 200))
      .offset(Math.max(0, page.offset));
  }

  async upload(libraryId: string, user: AuthUser, file: UploadInput) {
    const lib = await this.drizzle.requireLibrary(libraryId);
    if (user.role !== 'admin' && lib.photographerId !== user.id) {
      throw new ForbiddenException('only owner can upload');
    }
    if (!file.buffer?.length) throw new BadRequestException('empty file');

    let meta: sharp.Metadata;
    try {
      meta = await sharp(file.buffer, { failOn: 'truncated' }).metadata();
    } catch {
      throw new BadRequestException('file is not a valid image');
    }
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
      throw new BadRequestException(`unsupported image format: ${meta.format ?? 'unknown'}`);
    }
    if (!meta.width || !meta.height) {
      throw new BadRequestException('image has no dimensions');
    }

    const id = randomUUID();
    const ext = FORMAT_TO_EXT[meta.format] ?? '.bin';
    const originalsDir = join(this.storagePath, 'originals', libraryId);
    const thumbsDir = join(this.storagePath, 'thumbnails', libraryId);
    await mkdir(originalsDir, { recursive: true, mode: 0o750 });
    await mkdir(thumbsDir, { recursive: true, mode: 0o750 });

    const originalPath = join(originalsDir, `${id}${ext}`);
    const thumbnailPath = join(thumbsDir, `${id}.webp`);
    const thumbnailTmp = `${thumbnailPath}.tmp`;
    const originalTmp = `${originalPath}.tmp`;

    try {
      await writeFile(originalTmp, file.buffer, { mode: 0o640 });
      await sharp(file.buffer)
        .resize({ width: 800, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(thumbnailTmp);
      await rename(originalTmp, originalPath);
      await rename(thumbnailTmp, thumbnailPath);
    } catch (err) {
      await Promise.allSettled([unlink(originalTmp), unlink(thumbnailTmp)]);
      throw new BadRequestException('failed to process image');
    }

    const sanitizedName = sanitizeDisplayName(file.originalName);

    const [row] = await this.drizzle.db
      .insert(photos)
      .values({
        id,
        libraryId,
        name: sanitizedName,
        originalPath,
        thumbnailPath,
        width: meta.width,
        height: meta.height,
        byteSize: file.buffer.length,
      })
      .returning();
    if (!row) {
      await Promise.allSettled([unlink(originalPath), unlink(thumbnailPath)]);
      throw new BadRequestException('insert failed');
    }
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

function sanitizeDisplayName(raw: string): string {
  const trimmed = (raw ?? '').replace(/[\x00-\x1f\x7f]/g, '').trim();
  const noPath = trimmed.replace(/[\\/]/g, '_');
  return noPath.slice(0, 255) || 'photo';
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
    case '.heif':
      return 'image/heic';
    case '.avif':
      return 'image/avif';
    default:
      return 'application/octet-stream';
  }
}
