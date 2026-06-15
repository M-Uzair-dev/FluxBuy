import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class GetProductsDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  limit!: number;

  @IsString()
  @IsOptional()
  next!: string;
}
