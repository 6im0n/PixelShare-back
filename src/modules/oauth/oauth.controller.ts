import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Public } from '../../shared/public.decorator';
import { listOAuthProviders } from './oauth.registry';
import { OAuthService } from './oauth.service';

const STATE_COOKIE = 'oauth_state';
const INVITATION_COOKIE = 'oauth_invitation';
const INVITATION_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
const DEV_FRONTEND_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

function allowedRedirectOrigins(): Set<string> {
  const env = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const isProd = process.env.NODE_ENV === 'production';
  return new Set(isProd ? env : [...env, ...DEV_FRONTEND_ORIGINS]);
}

function isAllowedRedirect(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return allowedRedirectOrigins().has(u.origin);
  } catch {
    return false;
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

@ApiTags('oauth')
@Controller('oauth')
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('providers')
  list() {
    return { providers: listOAuthProviders() };
  }

  @Public()
  @Get(':provider/start')
  async start(
    @Param('provider') provider: string,
    @Query('invitation') invitation: string | undefined,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { url, state } = this.oauth.buildAuthorizationUrl(provider);
    const isProd = process.env.NODE_ENV === 'production';
    const cookieOpts = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: isProd,
      signed: true,
      path: '/',
      maxAge: 600,
    };
    res.setCookie(STATE_COOKIE, state, cookieOpts);
    if (invitation) {
      const code = invitation.toUpperCase();
      if (!INVITATION_CODE_RE.test(code)) {
        throw new BadRequestException('invalid invitation code');
      }
      res.setCookie(INVITATION_COOKIE, code, cookieOpts);
    } else {
      res.clearCookie(INVITATION_COOKIE, { path: '/' });
    }
    res.redirect(url, 302);
  }

  @Public()
  @Get(':provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    if (!code) throw new BadRequestException('missing code');
    if (!state) throw new BadRequestException('missing state');

    const signedState = req.cookies?.[STATE_COOKIE];
    const unsigned = signedState ? req.unsignCookie(signedState) : null;
    if (!unsigned?.valid || !unsigned.value || !safeEqual(unsigned.value, state)) {
      res.clearCookie(STATE_COOKIE, { path: '/' });
      res.clearCookie(INVITATION_COOKIE, { path: '/' });
      throw new ForbiddenException('invalid oauth state');
    }
    res.clearCookie(STATE_COOKIE, { path: '/' });

    const signedInv = req.cookies?.[INVITATION_COOKIE];
    const unsignedInv = signedInv ? req.unsignCookie(signedInv) : null;
    const raw = (unsignedInv?.valid ? unsignedInv.value ?? '' : '').toUpperCase();
    const invitationCode = INVITATION_CODE_RE.test(raw) ? raw : undefined;
    res.clearCookie(INVITATION_COOKIE, { path: '/' });

    const tokens = await this.oauth.handleCallback(provider, code, invitationCode);
    const frontendUrl = this.config.get<string>('FRONTEND_OAUTH_REDIRECT');
    if (frontendUrl && !isAllowedRedirect(frontendUrl)) {
      throw new BadRequestException('FRONTEND_OAUTH_REDIRECT origin not allowed');
    }
    if (frontendUrl) {
      const params = new URLSearchParams({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: String(tokens.expiresIn),
      });
      res.redirect(`${frontendUrl}#${params.toString()}`, 302);
      return;
    }
    return tokens;
  }
}
