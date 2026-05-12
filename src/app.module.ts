import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import {
  AccountModule,
  AuthModule,
  HealthModule,
  InvitationsModule,
  LibrariesModule,
  OAuthModule,
  OnboardingModule,
  PhotosModule,
  StarsModule,
} from './modules';
import { DrizzleModule } from './providers/drizzle/drizzle.module';
import { ResendModule } from './providers/resend/resend.module';
import { JwtAuthGuard } from './shared/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DrizzleModule,
    ResendModule,
    AuthModule,
    OAuthModule,
    AccountModule,
    LibrariesModule,
    InvitationsModule,
    OnboardingModule,
    PhotosModule,
    StarsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
