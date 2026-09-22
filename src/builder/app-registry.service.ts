import { Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';

const REGISTRY_ROOT = join(process.cwd(), 'app-registry');

export interface AndroidAppRecord {
  appId: string;
  applicationId: string;
  appName: string;
  targetUrl: string;
  themeColor: string;
  backgroundColor: string;
  versionCode: number;
  versionName: string;
  logoFileName: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Persists one JSON file per generated Android app under app-registry/<appId>.json,
 * plus the original uploaded logo, so a later "rebuild" (change url/name/icon)
 * can regenerate the APK without the user re-uploading everything.
 */
@Injectable()
export class AppRegistryService {
  private recordPath(appId: string): string {
    return join(REGISTRY_ROOT, `${appId}.json`);
  }

  logoPath(appId: string, extension: string): string {
    return join(REGISTRY_ROOT, `${appId}-logo.${extension}`);
  }

  async save(record: AndroidAppRecord): Promise<void> {
    await fs.mkdir(REGISTRY_ROOT, { recursive: true });
    await fs.writeFile(this.recordPath(record.appId), JSON.stringify(record, null, 2), 'utf8');
  }

  async get(appId: string): Promise<AndroidAppRecord> {
    try {
      const raw = await fs.readFile(this.recordPath(appId), 'utf8');
      return JSON.parse(raw) as AndroidAppRecord;
    } catch {
      throw new NotFoundException('اپی با این شناسه پیدا نشد');
    }
  }

  async saveLogo(appId: string, buffer: Buffer, extension: string): Promise<string> {
    await fs.mkdir(REGISTRY_ROOT, { recursive: true });
    const fileName = `${appId}-logo.${extension}`;
    await fs.writeFile(join(REGISTRY_ROOT, fileName), buffer);
    return fileName;
  }

  async readLogo(appId: string, fileName: string): Promise<Buffer> {
    return fs.readFile(join(REGISTRY_ROOT, fileName));
  }
}
