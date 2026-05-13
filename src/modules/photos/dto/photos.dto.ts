import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class PhotoParamsDto {
  @IsUUID()
  id!: string;
}

export class LibraryParamsDto {
  @IsUUID()
  libraryId!: string;
}

export class ListPhotosQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
