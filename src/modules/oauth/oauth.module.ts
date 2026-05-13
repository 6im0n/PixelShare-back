import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';

@Module({
  imports: [AuthModule, InvitationsModule],
  controllers: [OAuthController],
  providers: [OAuthService],
})
export class OAuthModule {}
