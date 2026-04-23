import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { AuthService } from '../auth/auth.service';
import { DrizzleService } from '../../providers/drizzle/drizzle.service';
import { users } from '../../providers/drizzle/schema/schema';
import { getOAuthProvider } from './oauth.registry';
import type { OAuthProfile } from './oauth.types';

@Injectable()
export class OAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly drizzle: DrizzleService,
    private readonly auth: AuthService,
  ) {}

  buildAuthorizationUrl(name: string): { url: string; state: string } {
    const provider = getOAuthProvider(name);
    const { clientId, redirectUri } = this.resolveCredentials(name);
    const state = randomBytes(16).toString('hex');
    const url = provider.authorizationUrl({ state, clientId, redirectUri });
    return { url, state };
  }

  async handleCallback(name: string, code: string) {
    const provider = getOAuthProvider(name);
    const { clientId, clientSecret, redirectUri } = this.resolveCredentials(name);
    const profile = await provider.exchangeCode({ code, clientId, clientSecret, redirectUri });
    const user = await this.upsertUser(provider.name, profile);
    return this.auth.issue(user);
  }

  private async upsertUser(provider: string, profile: OAuthProfile) {
    const existingOAuth = await this.drizzle.findUserByOAuth(provider, profile.providerId);
    if (existingOAuth) return existingOAuth;

    const existingEmail = await this.drizzle.findUserByEmail(profile.email);
    if (existingEmail) {
      const [updated] = await this.drizzle.db
        .update(users)
        .set({
          oauthProvider: provider,
          oauthProviderId: profile.providerId,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingEmail.id))
        .returning();
      if (!updated) throw new InternalServerErrorException('link oauth failed');
      return updated;
    }

    const [created] = await this.drizzle.db
      .insert(users)
      .values({
        email: profile.email.toLowerCase(),
        name: profile.name,
        role: 'client',
        oauthProvider: provider,
        oauthProviderId: profile.providerId,
      })
      .returning();
    if (!created) throw new InternalServerErrorException('create oauth user failed');
    return created;
  }

  private resolveCredentials(name: string) {
    const upper = name.toUpperCase();
    const clientId = this.config.get<string>(`${upper}_CLIENT_ID`);
    const clientSecret = this.config.get<string>(`${upper}_CLIENT_SECRET`);
    const redirectUri =
      this.config.get<string>(`${upper}_REDIRECT_URI`) ??
      `${this.config.get<string>('PUBLIC_URL') ?? ''}/api/oauth/${name}/callback`;
    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException(`oauth provider ${name} is not configured`);
    }
    return { clientId, clientSecret, redirectUri };
  }
}
