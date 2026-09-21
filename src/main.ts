import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Builder UI (the page with logo + URL + "Build App" button)
  app.useStaticAssets(join(__dirname, '..', 'public'), { prefix: '/' });

  // Generated PWAs are served from here, e.g. /apps/<id>/index.html
  app.useStaticAssets(join(__dirname, '..', 'generated'), { prefix: '/apps' });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`App Builder is running on http://localhost:${port}`);
}
bootstrap();
