import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import archiver from 'archiver';
import { v4 as uuid } from 'uuid';
import { BuildAppDto } from './dto/build-app.dto';

const GENERATED_ROOT = join(process.cwd(), 'generated');
const TEMPLATES_ROOT = join(__dirname, 'templates');

const ICON_SIZES = [192, 512] as const;
const MASKABLE_PADDING_RATIO = 0.2; // 20% safe-zone padding on each side

export interface BuildResult {
  id: string;
  appName: string;
  previewUrl: string;
  manifestUrl: string;
  downloadUrl: string;
}

@Injectable()
export class BuilderService {
  async buildApp(logo: Express.Multer.File, dto: BuildAppDto): Promise<BuildResult> {
    if (!logo) {
      throw new BadRequestException('لوگو الزامی است');
    }

    const targetUrl = this.normalizeUrl(dto.targetUrl);
    const appName = this.sanitizeAppName(dto.appName) || this.deriveAppName(targetUrl);
    const themeColor = dto.themeColor || '#4f46e5';
    const backgroundColor = dto.backgroundColor || '#0b0f1a';

    const id = uuid().slice(0, 10);
    const appDir = join(GENERATED_ROOT, id);
    const iconsDir = join(appDir, 'icons');
    await fs.mkdir(iconsDir, { recursive: true });

    await this.generateIcons(logo.buffer, iconsDir, backgroundColor);
    await this.writeIndexHtml(appDir, { appName, targetUrl, themeColor, backgroundColor });
    await this.writeManifest(appDir, { appName, themeColor, backgroundColor });
    await this.writeServiceWorker(appDir, id);

    return {
      id,
      appName,
      previewUrl: `/apps/${id}/index.html`,
      manifestUrl: `/apps/${id}/manifest.webmanifest`,
      downloadUrl: `/api/build/${id}/download`,
    };
  }

  async streamZip(id: string, res: NodeJS.WritableStream): Promise<void> {
    const appDir = join(GENERATED_ROOT, id);
    try {
      await fs.access(appDir);
    } catch {
      throw new NotFoundException('اپ مورد نظر پیدا نشد یا منقضی شده است');
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    archive.directory(appDir, false);
    await archive.finalize();
  }

  private normalizeUrl(rawUrl: string): string {
    const withProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    try {
      const url = new URL(withProtocol);
      return url.toString();
    } catch {
      throw new BadRequestException('آدرس وارد شده معتبر نیست');
    }
  }

  private deriveAppName(targetUrl: string): string {
    try {
      const hostname = new URL(targetUrl).hostname.replace(/^www\./, '');
      return hostname.split('.')[0] || 'My App';
    } catch {
      return 'My App';
    }
  }

  private sanitizeAppName(name?: string): string {
    if (!name) return '';
    return name.replace(/[<>]/g, '').trim().slice(0, 45);
  }

  private async generateIcons(
    logoBuffer: Buffer,
    iconsDir: string,
    backgroundColor: string,
  ): Promise<void> {
    const source = sharp(logoBuffer, { failOn: 'none' }).ensureAlpha();

    await Promise.all(
      ICON_SIZES.map(async (size) => {
        // Plain "any" purpose icon: logo filling the whole square.
        await source
          .clone()
          .resize(size, size, { fit: 'cover' })
          .png()
          .toFile(join(iconsDir, `icon-${size}.png`));

        // Maskable icon: logo shrunk into a safe zone on a solid background
        // so Android doesn't crop the logo when it applies a mask shape.
        const inner = Math.round(size * (1 - MASKABLE_PADDING_RATIO * 2));
        const logoLayer = await source
          .clone()
          .resize(inner, inner, { fit: 'contain', background: backgroundColor })
          .toBuffer();

        await sharp({
          create: {
            width: size,
            height: size,
            channels: 4,
            background: backgroundColor,
          },
        })
          .composite([{ input: logoLayer, gravity: 'center' }])
          .png()
          .toFile(join(iconsDir, `icon-${size}-maskable.png`));
      }),
    );

    // apple-touch-icon: iOS ignores transparency, so flatten onto the background.
    await source
      .clone()
      .resize(180, 180, { fit: 'cover' })
      .flatten({ background: backgroundColor })
      .png()
      .toFile(join(iconsDir, 'apple-touch-icon.png'));

    // favicon
    await source
      .clone()
      .resize(32, 32, { fit: 'cover' })
      .png()
      .toFile(join(iconsDir, 'favicon.png'));
  }

  private async writeIndexHtml(
    appDir: string,
    vars: { appName: string; targetUrl: string; themeColor: string; backgroundColor: string },
  ): Promise<void> {
    const template = await fs.readFile(join(TEMPLATES_ROOT, 'index.html.template'), 'utf8');
    const html = template
      .split('{{APP_NAME}}').join(this.escapeHtml(vars.appName))
      .split('{{TARGET_URL}}').join(vars.targetUrl)
      .split('{{THEME_COLOR}}').join(vars.themeColor)
      .split('{{BACKGROUND_COLOR}}').join(vars.backgroundColor);
    await fs.writeFile(join(appDir, 'index.html'), html, 'utf8');
  }

  private async writeManifest(
    appDir: string,
    vars: { appName: string; themeColor: string; backgroundColor: string },
  ): Promise<void> {
    const template = await fs.readFile(
      join(TEMPLATES_ROOT, 'manifest.webmanifest.template'),
      'utf8',
    );
    const manifest = template
      .split('{{APP_NAME}}').join(this.escapeJson(vars.appName))
      .split('{{APP_NAME_SHORT}}').join(this.escapeJson(vars.appName.slice(0, 12)))
      .split('{{THEME_COLOR}}').join(vars.themeColor)
      .split('{{BACKGROUND_COLOR}}').join(vars.backgroundColor);
    await fs.writeFile(join(appDir, 'manifest.webmanifest'), manifest, 'utf8');
  }

  private async writeServiceWorker(appDir: string, id: string): Promise<void> {
    const template = await fs.readFile(join(TEMPLATES_ROOT, 'sw.js.template'), 'utf8');
    const sw = template.split('{{CACHE_NAME}}').join(`app-shell-${id}`);
    await fs.writeFile(join(appDir, 'sw.js'), sw, 'utf8');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private escapeJson(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
}
