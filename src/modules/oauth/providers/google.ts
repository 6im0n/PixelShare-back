import { BadRequestException } from '@nestjs/common';
import type { OAuthProvider } from '../oauth.types';

export const googleProvider: OAuthProvider = {
  name: 'google',
  authorizationUrl({ state, clientId, redirectUri }) {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    return url.toString();
  },
  async exchangeCode({ code, clientId, clientSecret, redirectUri }) {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      throw new BadRequestException(`google token exchange failed: ${await tokenRes.text()}`);
    }
    const token = (await tokenRes.json()) as { access_token: string };

    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    if (!profileRes.ok) {
      throw new BadRequestException('google profile fetch failed');
    }
    const profile = (await profileRes.json()) as {
      sub: string;
      email: string;
      name?: string;
      email_verified?: boolean;
    };
    if (!profile.email_verified) {
      throw new BadRequestException('google email not verified');
    }
    return {
      providerId: profile.sub,
      email: profile.email,
      name: profile.name ?? profile.email,
    };
  },
};
