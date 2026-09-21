import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import { BuildAppDto } from './dto/build-app.dto';
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

export type AndroidJobStatus = 'queued' | 'building' | 'done' | 'error';

export interface AndroidJob {
  id: string;
  status: AndroidJobStatus;
  appName: string;
  error?: string;
  createdAt: number;
}

@Injectable()
export class AndroidBuilderService {
  private readonly logger = new Logger(AndroidBuilderService.name);
  private readonly jobs = new Map<string, AndroidJob>();
  // Serializes Gradle invocations so concurrent build requests don't fight
  // over the shared Gradle daemon / cache.
  private queue: Promise<void> = Promise.resolve();

  async startBuild(logo: Express.Multer.File, dto: BuildAppDto): Promise<AndroidJob> {
    if (!logo) {
      throw new BadRequestException('لوگو الزامی است');
    }

    const targetUrl = this.normalizeUrl(dto.targetUrl);
    const appName = this.sanitizeAppName(dto.appName) || this.deriveAppName(targetUrl);
    const themeColor = dto.themeColor || '#4f46e5';
    const backgroundColor = dto.backgroundColor || '#0b0f1a';

    const id = uuid().replace(/-/g, '').slice(0, 12);
    const job: AndroidJob = { id, status: 'queued', appName, createdAt: Date.now() };
    this.jobs.set(id, job);

    this.queue = this.queue.then(() =>
      this.runBuild(job, logo.buffer, { targetUrl, appName, themeColor, backgroundColor }).catch((err) => {
        job.status = 'error';
        job.error = err?.message || 'ساخت اپ اندروید با خطا مواجه شد';
        this.logger.error(`Android build ${id} failed: ${job.error}`);
      }),
    );

    return job;
  }

  getJob(id: string): AndroidJob {
    const job = this.jobs.get(id);
    if (!job) {
      throw new NotFoundException('درخواست ساخت پیدا نشد');
    }
    return job;
  }

  async streamApk(id: string, res: NodeJS.WritableStream): Promise<void> {
    const job = this.getJob(id);
    if (job.status !== 'done') {
      throw new BadRequestException('اپ هنوز آماده نیست');
    }
    const apkPath = join(OUTPUT_ROOT, `${id}.apk`);
    const buffer = await fs.readFile(apkPath);
    res.write(buffer);
    res.end();
  }

  private async runBuild(
    job: AndroidJob,
    logoBuffer: Buffer,
    vars: { targetUrl: string; appName: string; themeColor: string; backgroundColor: string },
  ): Promise<void> {
    job.status = 'building';
    const workDir = join(WORK_ROOT, job.id);

    await fs.mkdir(WORK_ROOT, { recursive: true });
    await fs.cp(TEMPLATE_DIR, workDir, { recursive: true });

    await this.writeAndroidManifestVars(workDir, vars.appName, vars.targetUrl, vars.themeColor, vars.backgroundColor);
    await this.writeApplicationId(workDir, job.id);
    await this.generateAndroidIcons(workDir, logoBuffer, vars.backgroundColor);

    await this.runGradle(workDir);

    const apkSrc = join(workDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    await fs.mkdir(OUTPUT_ROOT, { recursive: true });
    await fs.copyFile(apkSrc, join(OUTPUT_ROOT, `${job.id}.apk`));

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

  private async writeAndroidManifestVars(
    workDir: string,
    appName: string,
    targetUrl: string,
    themeColor: string,
    backgroundColor: string,
  ): Promise<void> {
    const stringsPath = join(workDir, 'app', 'src', 'main', 'res', 'values', 'strings.xml');
    const stringsTemplate = await fs.readFile(stringsPath, 'utf8');
    const strings = stringsTemplate
      .split('{{APP_NAME}}').join(this.escapeXml(appName))
      .split('{{TARGET_URL}}').join(this.escapeXml(targetUrl));
    await fs.writeFile(stringsPath, strings, 'utf8');

    const colorsPath = join(workDir, 'app', 'src', 'main', 'res', 'values', 'colors.xml');
    const colorsTemplate = await fs.readFile(colorsPath, 'utf8');
    const colors = colorsTemplate
      .split('{{THEME_COLOR}}').join(themeColor)
      .split('{{BACKGROUND_COLOR}}').join(backgroundColor);
    await fs.writeFile(colorsPath, colors, 'utf8');
  }

  private async writeApplicationId(workDir: string, id: string): Promise<void> {
    const gradlePath = join(workDir, 'app', 'build.gradle');
    const template = await fs.readFile(gradlePath, 'utf8');
    const applicationId = `com.appbuilder.gen${id}`;
    await fs.writeFile(gradlePath, template.split('{{APPLICATION_ID}}').join(applicationId), 'utf8');
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
