import { IsUUID } from 'class-validator';

export class PhotoParamsDto {
  @IsUUID()
  id!: string;
}

export class LibraryParamsDto {
  @IsUUID()
  libraryId!: string;
}
