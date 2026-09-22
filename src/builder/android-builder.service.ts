import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import { AndroidAppRecord, AppRegistryService } from './app-registry.service';
import { BuildAppDto } from './dto/build-app.dto';
import { UpdateAndroidAppDto } from './dto/update-android-app.dto';
import { loadLogo, renderFilledSquareIcon, renderSplashCard, toCircleMasked } from './utils/android-icon.util';

const TEMPLATE_DIR = join(__dirname, 'templates', 'android-template');
const WORK_ROOT = join(process.cwd(), 'android-builds');
const OUTPUT_ROOT = join(process.cwd(), 'generated-apks');

const LAUNCHER_SIZES: Record<string, number> = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

export type AndroidJobStatus = 'building' | 'done' | 'error';

export interface AndroidJob {
  appId: string;
  status: AndroidJobStatus;
  appName: string;
  error?: string;
}

@Injectable()
export class AndroidBuilderService {
  private readonly logger = new Logger(AndroidBuilderService.name);
  private readonly jobs = new Map<string, AndroidJob>();
  // Serializes Gradle invocations so concurrent build requests don't fight
  // over the shared Gradle daemon / cache.
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly registry: AppRegistryService) {}

  async create(logo: Express.Multer.File, dto: BuildAppDto, baseUrl: string): Promise<AndroidJob> {
    if (!logo) {
      throw new BadRequestException('لوگو الزامی است');
    }

    const appId = uuid().replace(/-/g, '').slice(0, 12);
    const record: AndroidAppRecord = {
      appId,
      applicationId: `com.appbuilder.gen${appId}`,
      appName: this.sanitizeAppName(dto.appName) || this.deriveAppName(this.normalizeUrl(dto.targetUrl)),
      targetUrl: this.normalizeUrl(dto.targetUrl),
      themeColor: dto.themeColor || '#4f46e5',
      backgroundColor: dto.backgroundColor || '#0b0f1a',
      versionCode: 1,
      versionName: '1.0',
      logoFileName: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return this.enqueueBuild(record, logo.buffer, baseUrl);
  }

  async rebuild(
    appId: string,
    logo: Express.Multer.File | undefined,
    dto: UpdateAndroidAppDto,
    baseUrl: string,
  ): Promise<AndroidJob> {
    const existing = await this.registry.get(appId);

    const record: AndroidAppRecord = {
      ...existing,
      appName: dto.appName ? this.sanitizeAppName(dto.appName) : existing.appName,
      targetUrl: dto.targetUrl ? this.normalizeUrl(dto.targetUrl) : existing.targetUrl,
      themeColor: dto.themeColor || existing.themeColor,
      backgroundColor: dto.backgroundColor || existing.backgroundColor,
      versionCode: existing.versionCode + 1,
      versionName: `1.${existing.versionCode}`,
      updatedAt: Date.now(),
    };

    const logoBuffer = logo ? logo.buffer : await this.registry.readLogo(appId, existing.logoFileName);
    return this.enqueueBuild(record, logoBuffer, baseUrl);
  }

  /** Cheap, instant change: no rebuild, no version bump, takes effect on the next app launch. */
  async patchUrl(appId: string, targetUrl: string): Promise<AndroidAppRecord> {
    const record = await this.registry.get(appId);
    record.targetUrl = this.normalizeUrl(targetUrl);
    record.updatedAt = Date.now();
    await this.registry.save(record);
    return record;
  }

  getJob(appId: string): AndroidJob | undefined {
    return this.jobs.get(appId);
  }

  async getRecord(appId: string) {
    return this.registry.get(appId);
  }

  async getPublicConfig(appId: string, baseUrl: string) {
    const record = await this.registry.get(appId);
    return {
      targetUrl: record.targetUrl,
      appName: record.appName,
      latestVersionCode: record.versionCode,
      downloadUrl: `${baseUrl}/api/apps/${appId}/download`,
    };
  }

  async getLogo(appId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const record = await this.registry.get(appId);
    const buffer = await this.registry.readLogo(appId, record.logoFileName);
    const extension = record.logoFileName.split('.').pop() || 'png';
    const contentTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      webp: 'image/webp',
      svg: 'image/svg+xml',
    };
    return { buffer, contentType: contentTypes[extension] || 'image/png' };
  }

  async streamApk(appId: string, res: NodeJS.WritableStream): Promise<void> {
    await this.registry.get(appId); // 404s if the app was never built
    const buffer = await fs.readFile(join(OUTPUT_ROOT, `${appId}.apk`));
    res.write(buffer);
    res.end();
  }

  private enqueueBuild(record: AndroidAppRecord, logoBuffer: Buffer, baseUrl: string): AndroidJob {
    const job: AndroidJob = { appId: record.appId, status: 'building', appName: record.appName };
    this.jobs.set(record.appId, job);

    this.queue = this.queue.then(() =>
      this.runBuild(record, logoBuffer, baseUrl, job).catch((err) => {
        job.status = 'error';
        job.error = err?.message || 'ساخت اپ اندروید با خطا مواجه شد';
        this.logger.error(`Android build ${record.appId} failed: ${job.error}`);
      }),
    );

    return job;
  }

  private async runBuild(
    record: AndroidAppRecord,
    logoBuffer: Buffer,
    baseUrl: string,
    job: AndroidJob,
  ): Promise<void> {
    const workDir = join(WORK_ROOT, `${record.appId}-v${record.versionCode}`);

    await fs.mkdir(WORK_ROOT, { recursive: true });
    await fs.cp(TEMPLATE_DIR, workDir, { recursive: true });

    const configUrl = `${baseUrl}/api/apps/${record.appId}/config`;
    await this.writeAndroidResources(workDir, record, configUrl);
    await this.writeGradleConfig(workDir, record);
    await this.generateAndroidIcons(workDir, logoBuffer, record.backgroundColor);

    await this.runGradle(workDir);

    const apkSrc = join(workDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    await fs.mkdir(OUTPUT_ROOT, { recursive: true });
    await fs.copyFile(apkSrc, join(OUTPUT_ROOT, `${record.appId}.apk`));

    // Persist the logo + record only once the build actually succeeded, so a
    // failed rebuild never clobbers the last known-good, installed version.
    const extension = this.inferExtension(logoBuffer);
    record.logoFileName = await this.registry.saveLogo(record.appId, logoBuffer, extension);
    await this.registry.save(record);

    job.status = 'done';

    fs.rm(workDir, { recursive: true, force: true }).catch(() => {
      // best-effort cleanup; Gradle may still hold file handles briefly on Windows
    });
  }

  private runGradle(workDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // shell:true is required on Windows to resolve gradle.bat; the args here
      // are fixed literals (no user input reaches argv), so it's safe.
      const child = spawn('gradle', ['assembleDebug', '--console=plain'], {
        cwd: workDir,
        shell: true,
      });

      let stderr = '';
      child.stdout.on('data', (chunk) => this.logger.debug(chunk.toString().trim()));
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(stderr.split('\n').slice(-20).join('\n') || `gradle exited with code ${code}`));
        }
      });
    });
  }

  private async writeAndroidResources(workDir: string, record: AndroidAppRecord, configUrl: string): Promise<void> {
    const stringsPath = join(workDir, 'app', 'src', 'main', 'res', 'values', 'strings.xml');
    const stringsTemplate = await fs.readFile(stringsPath, 'utf8');
    const strings = stringsTemplate
      .split('{{APP_NAME}}').join(this.escapeXml(record.appName))
      .split('{{TARGET_URL}}').join(this.escapeXml(record.targetUrl))
      .split('{{CONFIG_URL}}').join(this.escapeXml(configUrl));
    await fs.writeFile(stringsPath, strings, 'utf8');

    const colorsPath = join(workDir, 'app', 'src', 'main', 'res', 'values', 'colors.xml');
    const colorsTemplate = await fs.readFile(colorsPath, 'utf8');
    const colors = colorsTemplate
      .split('{{THEME_COLOR}}').join(record.themeColor)
      .split('{{BACKGROUND_COLOR}}').join(record.backgroundColor);
    await fs.writeFile(colorsPath, colors, 'utf8');
  }

  private async writeGradleConfig(workDir: string, record: AndroidAppRecord): Promise<void> {
    const gradlePath = join(workDir, 'app', 'build.gradle');
    const template = await fs.readFile(gradlePath, 'utf8');
    const gradle = template
      .split('{{APPLICATION_ID}}').join(record.applicationId)
      .split('{{VERSION_CODE}}').join(String(record.versionCode))
      .split('{{VERSION_NAME}}').join(record.versionName);
    await fs.writeFile(gradlePath, gradle, 'utf8');
  }

  private async generateAndroidIcons(workDir: string, logoBuffer: Buffer, backgroundColor: string): Promise<void> {
    const resDir = join(workDir, 'app', 'src', 'main', 'res');
    const source = loadLogo(logoBuffer);

    await Promise.all(
      Object.entries(LAUNCHER_SIZES).map(async ([folder, size]) => {
        const dir = join(resDir, folder);
        await fs.mkdir(dir, { recursive: true });

        const square = await renderFilledSquareIcon(source, size, backgroundColor);
        await fs.writeFile(join(dir, 'ic_launcher.png'), square);

        const round = await toCircleMasked(square, size);
        await fs.writeFile(join(dir, 'ic_launcher_round.png'), round);
      }),
    );

    const drawableDir = join(resDir, 'drawable');
    await fs.mkdir(drawableDir, { recursive: true });
    const splashCard = await renderSplashCard(source, 240);
    await fs.writeFile(join(drawableDir, 'splash_logo.png'), splashCard);
  }

  private inferExtension(buffer: Buffer): string {
    // Cheap sniff by magic bytes; falls back to png (sharp always re-encodes
    // icons as png regardless, this is only for storing the source logo).
    if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (buffer.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpg';
    if (buffer.slice(0, 4).toString('ascii') === 'RIFF') return 'webp';
    return 'svg';
  }

  private normalizeUrl(rawUrl: string): string {
    const withProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    try {
      return new URL(withProtocol).toString();
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

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
