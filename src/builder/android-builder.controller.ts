import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { AndroidBuilderService } from './android-builder.service';
import { BuildAppDto } from './dto/build-app.dto';
import { PatchUrlDto } from './dto/patch-url.dto';
import { UpdateAndroidAppDto } from './dto/update-android-app.dto';
import { logoUploadOptions } from './utils/logo-upload.config';

@Controller('api/apps')
export class AndroidBuilderController {
  constructor(private readonly androidBuilderService: AndroidBuilderService) {}

  @Post()
  @UseInterceptors(FileInterceptor('logo', logoUploadOptions))
  async create(@UploadedFile() logo: Express.Multer.File, @Body() dto: BuildAppDto, @Req() req: Request) {
    const job = await this.androidBuilderService.create(logo, dto, this.baseUrl(req));
    return {
      success: true,
      appId: job.appId,
      status: job.status,
      appName: job.appName,
      statusUrl: `/api/apps/${job.appId}/status`,
      manageUrl: `/manage.html?id=${job.appId}`,
    };
  }

  /** Rebuilds the APK with a new icon/name/url/colors and bumps the version, triggering the in-app update prompt for existing installs. */
  @Post(':appId/rebuild')
  @UseInterceptors(FileInterceptor('logo', logoUploadOptions))
  async rebuild(
    @Param('appId') appId: string,
    @UploadedFile() logo: Express.Multer.File | undefined,
    @Body() dto: UpdateAndroidAppDto,
    @Req() req: Request,
  ) {
    const job = await this.androidBuilderService.rebuild(appId, logo, dto, this.baseUrl(req));
    return {
      success: true,
      appId: job.appId,
      status: job.status,
      appName: job.appName,
      statusUrl: `/api/apps/${job.appId}/status`,
    };
  }

  /** Cheap change: updates the target URL for every installed copy instantly, no rebuild or reinstall needed. */
  @Patch(':appId/url')
  async patchUrl(@Param('appId') appId: string, @Body() dto: PatchUrlDto) {
    const record = await this.androidBuilderService.patchUrl(appId, dto.targetUrl);
    return { success: true, appId: record.appId, targetUrl: record.targetUrl };
  }

  @Get(':appId/status')
  async status(@Param('appId') appId: string) {
    const job = this.androidBuilderService.getJob(appId);
    const record = await this.androidBuilderService.getRecord(appId).catch(() => undefined);

    return {
      appId,
      status: job?.status ?? (record ? 'done' : undefined),
      appName: job?.appName ?? record?.appName,
      error: job?.error,
      versionCode: record?.versionCode,
      targetUrl: record?.targetUrl,
      downloadUrl: record ? `/api/apps/${appId}/download` : undefined,
    };
  }

  /** Called by the generated app itself on every launch to fetch the live URL and check for updates. Public, no auth. */
  @Get(':appId/config')
  async config(@Param('appId') appId: string, @Req() req: Request) {
    return this.androidBuilderService.getPublicConfig(appId, this.baseUrl(req));
  }

  @Get(':appId/download')
  async download(@Param('appId') appId: string, @Res() res: Response) {
    const record = await this.androidBuilderService.getRecord(appId);
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', buildContentDisposition(record.appName || 'app', 'apk'));
    await this.androidBuilderService.streamApk(appId, res);
  }

  @Get(':appId/logo')
  async logo(@Param('appId') appId: string, @Res() res: Response) {
    const { buffer, contentType } = await this.androidBuilderService.getLogo(appId);
    res.setHeader('Content-Type', contentType);
    res.write(buffer);
    res.end();
  }

  private baseUrl(req: Request): string {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol = typeof forwardedProto === 'string' ? forwardedProto.split(',')[0] : req.protocol;
    return `${protocol}://${req.get('host')}`;
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
