import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { BuilderService } from './builder.service';
import { BuildAppDto } from './dto/build-app.dto';
import { logoUploadOptions } from './utils/logo-upload.config';

@Controller('api/build')
export class BuilderController {
  constructor(private readonly builderService: BuilderService) {}

  @Post()
  @UseInterceptors(FileInterceptor('logo', logoUploadOptions))
  async build(
    @UploadedFile() logo: Express.Multer.File,
    @Body() dto: BuildAppDto,
  ) {
    const result = await this.builderService.buildApp(logo, dto);
    return { success: true, ...result };
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="app-${id}.zip"`);
    await this.builderService.streamZip(id, res);
  }
}
