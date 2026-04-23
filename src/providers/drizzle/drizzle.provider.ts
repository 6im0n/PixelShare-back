import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDrizzleClient, type DrizzleDB } from './schema/client';

export const DRIZZLE = Symbol('DRIZZLE_DB');

export type DrizzleInjection = DrizzleDB;

export const drizzleProvider: Provider = {
  provide: DRIZZLE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const url = config.getOrThrow<string>('DATABASE_URL');
    const { db } = createDrizzleClient(url);
    return db;
  },
};
