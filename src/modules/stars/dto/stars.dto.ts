import { IsInt, Max, Min } from 'class-validator';

export class SetStarDto {
  @IsInt()
  @Min(0)
  @Max(5)
  value!: number;
}
