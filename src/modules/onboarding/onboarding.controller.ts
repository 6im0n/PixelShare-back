import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../shared/public.decorator';
import { OnboardingService } from './onboarding.service';
import { SetupDto } from './dto/onboarding.dto';

@ApiTags('onboarding')
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Public()
  @Get('status')
  status() {
    return { required: this.onboarding.isRequired() };
  }

  @Public()
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @Post('setup')
  setup(@Body() dto: SetupDto) {
    return this.onboarding.setup(dto);
  }
}
