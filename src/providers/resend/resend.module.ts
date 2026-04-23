import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ResendService } from './resend.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [ResendService],
  exports: [ResendService],
})
export class ResendModule {}
