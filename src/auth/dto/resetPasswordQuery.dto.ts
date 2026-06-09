import { IsNotEmpty, IsString } from 'class-validator';

export class ResetPasswordQueryDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
