import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { eq, or } from 'drizzle-orm';
import { ConfigService } from '@nestjs/config';
import { DrizzleService } from '../../providers/drizzle/drizzle.service';
import { ResendService, verificationEmailHtml } from '../../providers/resend/resend.service';
import { users } from '../../providers/drizzle/schema/schema';
import { hashPassword } from '../../shared/password.util';
import type { SetupDto } from './dto/onboarding.dto';

@Injectable()
export class OnboardingService implements OnModuleInit {
  private readonly logger = new Logger(OnboardingService.name);
  private onboardingKey: string | null = null;
  private completed = false;

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly resend: ResendService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.checkAndPrintKey();
  }

  async checkAndPrintKey() {
    const [existing] = await this.drizzle.db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.role, 'admin'), eq(users.role, 'photographer')))
      .limit(1);

    if (existing) {
      this.completed = true;
      return;
    }

    this.onboardingKey = randomBytes(3).toString('hex').toUpperCase();
    this.logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.warn('  No admin/photographer found. Onboarding required.');
    this.logger.warn(`  Setup key: ${this.onboardingKey}`);
    this.logger.warn('  POST /api/onboarding/setup  { key, name, email, password }');
    this.logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  isRequired(): boolean {
    return !this.completed && this.onboardingKey !== null;
  }

  async setup(dto: SetupDto) {
    if (this.completed) {
      throw new BadRequestException('onboarding already completed');
    }
    if (!this.onboardingKey || dto.key !== this.onboardingKey) {
      throw new BadRequestException('invalid onboarding key');
    }

    const email = dto.email.toLowerCase();
    const [existing] = await this.drizzle.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) throw new BadRequestException('email already registered');

    const passwordHash = await hashPassword(dto.password);
    const [user] = await this.drizzle.db
      .insert(users)
      .values({ email, name: dto.name, passwordHash, role: 'admin', emailVerified: true })
      .returning();

    this.completed = true;
    this.onboardingKey = null;
    this.logger.log(`Admin account created for ${email}`);

    const frontendUrl =
      this.config.get<string>('FRONTEND_OAUTH_REDIRECT')?.replace('/oauth/callback', '') ??
      'http://localhost:3000';
    try {
      await this.resend.send({
        to: email,
        subject: 'Welcome to PixelShare — admin account created',
        html: verificationEmailHtml({
          name: dto.name,
          link: `${frontendUrl}/login`,
          subject: 'Welcome to PixelShare',
          action: 'Your PixelShare admin account has been created. You can now sign in.',
        }),
      });
    } catch {
      // non-blocking
    }

    return { ok: true, userId: user!.id, email: user!.email };
  }
}
