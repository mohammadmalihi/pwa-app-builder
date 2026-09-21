import { IsHexColor, IsOptional, IsString, IsUrl, Length } from 'class-validator';

export class BuildAppDto {
  @IsUrl(
    { require_protocol: false },
    { message: 'آدرس وارد شده معتبر نیست' },
  )
  targetUrl: string;

  @IsOptional()
  @IsString()
  @Length(1, 45, { message: 'نام اپ باید بین ۱ تا ۴۵ کاراکتر باشد' })
  appName?: string;

  @IsOptional()
  @IsHexColor({ message: 'کد رنگ تم باید هگز معتبر باشد، مثل #4f46e5' })
  themeColor?: string;

  @IsOptional()
  @IsHexColor({ message: 'کد رنگ پس‌زمینه باید هگز معتبر باشد، مثل #0b0f1a' })
  backgroundColor?: string;
}
