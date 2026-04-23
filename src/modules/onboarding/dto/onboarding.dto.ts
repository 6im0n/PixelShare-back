import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SetupDto {
  @IsString()
  @MinLength(6)
  key!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  password!: string;
}
