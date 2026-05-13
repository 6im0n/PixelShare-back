import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { UserRole } from '../../../shared/types';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  password?: string;
}

export class RequestEmailChangeDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class UpdateUserDto extends UpdateMeDto {
  @IsOptional()
  @IsIn(['admin', 'photographer', 'client'])
  role?: UserRole;
}
