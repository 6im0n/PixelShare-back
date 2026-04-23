import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { DrizzleService } from '../../providers/drizzle/drizzle.service';
import { Public } from '../../shared/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly drizzle: DrizzleService) {}

  @Public()
  @Get()
  async check() {
    let dbOk = false;
    try {
      await this.drizzle.db.execute(sql`SELECT 1`);
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return {
      status: dbOk ? 'ok' : 'degraded',
      uptime: process.uptime(),
      db: dbOk ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    };
  }
}
