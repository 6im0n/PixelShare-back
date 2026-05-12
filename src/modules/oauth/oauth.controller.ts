import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Public } from '../../shared/public.decorator';
import { listOAuthProviders } from './oauth.registry';
import { OAuthService } from './oauth.service';

const INVITATION_COOKIE = 'oauth_invitation';
const INVITATION_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

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
    res.setCookie('oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });
    if (invitation) {
      const code = invitation.toUpperCase();
      if (!INVITATION_CODE_RE.test(code)) {
        throw new BadRequestException('invalid invitation code');
      }
      res.setCookie(INVITATION_COOKIE, code, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 600,
      });
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
    @Query('state') _state: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    if (!code) throw new BadRequestException('missing code');
    const raw = (req.cookies?.[INVITATION_COOKIE] ?? '').toUpperCase();
    const invitationCode = INVITATION_CODE_RE.test(raw) ? raw : undefined;
    res.clearCookie(INVITATION_COOKIE, { path: '/' });

    const tokens = await this.oauth.handleCallback(provider, code, invitationCode);
    const frontendUrl = this.config.get<string>('FRONTEND_OAUTH_REDIRECT');
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
