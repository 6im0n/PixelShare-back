import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const NO_CONTROL_CHARS = /^[^\x00-\x1f\x7f]+$/;

export class CreateLibraryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(NO_CONTROL_CHARS, { message: 'name must not contain control characters' })
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
  @Matches(NO_CONTROL_CHARS, { message: 'name must not contain control characters' })
  name?: string;

  @IsOptional()
  @IsDateString()
  shootDate?: string;
}

export class GrantClientDto {
  @IsUUID()
  clientId!: string;
}
