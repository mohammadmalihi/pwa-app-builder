import { Module } from '@nestjs/common';
import { AndroidBuilderController } from './android-builder.controller';
import { AndroidBuilderService } from './android-builder.service';
import { BuilderController } from './builder.controller';
import { BuilderService } from './builder.service';

@Module({
  controllers: [BuilderController, AndroidBuilderController],
  providers: [BuilderService, AndroidBuilderService],
})
export class BuilderModule {}
