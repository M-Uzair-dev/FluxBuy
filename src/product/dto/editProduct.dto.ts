import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class EditProductDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name!: string;

  @IsString()
  @IsOptional()
  description!: string;

  @IsUrl()
  @IsOptional()
  imageUrl!: string;
}
