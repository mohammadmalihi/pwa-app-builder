import { IsUrl } from 'class-validator';

export class PatchUrlDto {
  @IsUrl({ require_protocol: false }, { message: 'آدرس وارد شده معتبر نیست' })
  targetUrl: string;
}
