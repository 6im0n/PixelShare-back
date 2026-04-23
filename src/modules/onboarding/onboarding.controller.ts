import { Body, Controller, Get, Post } from '@nestjs/common';
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
  @Post('setup')
  setup(@Body() dto: SetupDto) {
    return this.onboarding.setup(dto);
  }
}
