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
import { AndroidBuilderService } from './android-builder.service';
import { BuildAppDto } from './dto/build-app.dto';
import { logoUploadOptions } from './utils/logo-upload.config';

@Controller('api/build/android')
export class AndroidBuilderController {
  constructor(private readonly androidBuilderService: AndroidBuilderService) {}

  @Post()
  @UseInterceptors(FileInterceptor('logo', logoUploadOptions))
  async build(@UploadedFile() logo: Express.Multer.File, @Body() dto: BuildAppDto) {
    const job = await this.androidBuilderService.startBuild(logo, dto);
    return {
      success: true,
      id: job.id,
      status: job.status,
      appName: job.appName,
      statusUrl: `/api/build/android/${job.id}/status`,
    };
  }

  @Get(':id/status')
  status(@Param('id') id: string) {
    const job = this.androidBuilderService.getJob(id);
    return {
      id: job.id,
      status: job.status,
      appName: job.appName,
      error: job.error,
      downloadUrl: job.status === 'done' ? `/api/build/android/${job.id}/download` : undefined,
    };
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const job = this.androidBuilderService.getJob(id);
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', buildContentDisposition(job.appName || 'app', 'apk'));
    await this.androidBuilderService.streamApk(id, res);
  }
}

/**
 * HTTP header values must be Latin1; a non-ASCII app name (e.g. Persian)
 * throws ERR_INVALID_CHAR if put directly into filename="...". RFC 5987's
 * filename* carries the real UTF-8 name, with an ASCII-safe fallback for
 * older clients.
 */
function buildContentDisposition(displayName: string, extension: string): string {
  const asciiFallback = displayName.replace(/[^\x20-\x7e]/g, '').trim() || 'app';
  const encoded = encodeURIComponent(`${displayName}.${extension}`);
  return `attachment; filename="${asciiFallback}.${extension}"; filename*=UTF-8''${encoded}`;
}
