import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleInjection } from './drizzle.provider';
import {
  libraries,
  libraryClients,
  photos,
  users,
  type Library,
  type Photo,
  type User,
} from './schema/schema';

@Injectable()
export class DrizzleService {
  constructor(@Inject(DRIZZLE) public readonly db: DrizzleInjection) {}

  async findUserById(id: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    return row ?? null;
  }

  async findUserByOAuth(provider: string, providerId: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.oauthProvider, provider), eq(users.oauthProviderId, providerId)))
      .limit(1);
    return row ?? null;
  }

  async requireUser(id: string): Promise<User> {
    const user = await this.findUserById(id);
    if (!user) throw new NotFoundException('user not found');
    return user;
  }

  async findLibrary(id: string): Promise<Library | null> {
    const [row] = await this.db.select().from(libraries).where(eq(libraries.id, id)).limit(1);
    return row ?? null;
  }

  async requireLibrary(id: string): Promise<Library> {
    const lib = await this.findLibrary(id);
    if (!lib) throw new NotFoundException('library not found');
    return lib;
  }

  async findPhoto(id: string): Promise<Photo | null> {
    const [row] = await this.db.select().from(photos).where(eq(photos.id, id)).limit(1);
    return row ?? null;
  }

  async requirePhoto(id: string): Promise<Photo> {
    const photo = await this.findPhoto(id);
    if (!photo) throw new NotFoundException('photo not found');
    return photo;
  }

  async isLibraryOwner(libraryId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: libraries.id })
      .from(libraries)
      .where(and(eq(libraries.id, libraryId), eq(libraries.photographerId, userId)))
      .limit(1);
    return !!row;
  }

  async isLibraryClient(libraryId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ libraryId: libraryClients.libraryId })
      .from(libraryClients)
      .where(and(eq(libraryClients.libraryId, libraryId), eq(libraryClients.clientId, userId)))
      .limit(1);
    return !!row;
  }

  async canAccessLibrary(libraryId: string, userId: string, role: string): Promise<boolean> {
    if (role === 'admin') return true;
    if (await this.isLibraryOwner(libraryId, userId)) return true;
    return this.isLibraryClient(libraryId, userId);
  }
}
