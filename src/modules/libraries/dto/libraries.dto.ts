import { IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateLibraryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsDateString()
  shootDate?: string;
}

export class UpdateLibraryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsDateString()
  shootDate?: string;
}

export class GrantClientDto {
  @IsUUID()
  clientId!: string;
}
