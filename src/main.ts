import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
  );

  await app.register(fastifyCookie as any);
  await app.register(fastifyCors as any, {
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Disposition'],
  });
  await app.register(fastifyMultipart as any, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  if (process.env.NODE_ENV !== 'production') {
    const swagger = new DocumentBuilder()
      .setTitle('PixelShare API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, swagger);
    SwaggerModule.setup('swagger', app, doc);
  }

  const host = process.env.BIND_HOST ?? '0.0.0.0';
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, host);
  console.log(`pixelshare-back listening on http://${host}:${port}`);
}

bootstrap().catch((err) => {
  console.error('bootstrap failed', err);
  process.exit(1);
});
