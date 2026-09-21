import { Module } from '@nestjs/common';
import { BuilderModule } from './builder/builder.module';

@Module({
  imports: [BuilderModule],
})
export class AppModule {}
