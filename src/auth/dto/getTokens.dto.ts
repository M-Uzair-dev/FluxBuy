import { IsNotEmpty, IsString } from 'class-validator';

export class getTokensDto {
  @IsString()
  @IsNotEmpty()
  uid!: string;
}
