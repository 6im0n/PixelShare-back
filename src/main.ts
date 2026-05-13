import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { AppModule } from './app.module';

const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  const envOrigins = parseOrigins(process.env.CORS_ORIGIN);
  if (isProd && envOrigins.length === 0) {
    throw new Error('CORS_ORIGIN env var is required in production (comma-separated allowlist)');
  }
  const allowedOrigins = isProd ? envOrigins : [...envOrigins, ...DEV_ORIGINS];

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: isProd,
      bodyLimit: 1024 * 1024,
    }),
  );

  const cookieSecret =
    process.env.COOKIE_SECRET ??
    (isProd ? null : randomBytes(32).toString('hex'));
  if (isProd && !cookieSecret) {
    throw new Error('COOKIE_SECRET env var required in production');
  }
  await app.register(fastifyCookie as any, { secret: cookieSecret });

  await app.register(fastifyHelmet as any, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(fastifyCors as any, {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error('origin not allowed'), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Disposition'],
  });

  await app.register(fastifyMultipart as any, {
    limits: {
      fileSize: 50 * 1024 * 1024,
      files: 20,
      fields: 20,
      parts: 60,
      headerPairs: 200,
    },
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: true,
    }),
  );

  if (!isProd) {
    const swagger = new DocumentBuilder()
      .setTitle('PixelShare API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, swagger);
    SwaggerModule.setup('swagger', app, doc);
  }

  const host = process.env.BIND_HOST ?? (isProd ? '127.0.0.1' : '0.0.0.0');
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, host);
  console.log(`pixelshare-back listening on http://${host}:${port}`);
}

bootstrap().catch((err) => {
  console.error('bootstrap failed', err);
  process.exit(1);
});
