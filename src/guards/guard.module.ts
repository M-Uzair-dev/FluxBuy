import { Module } from '@nestjs/common';
import { TokenModule } from '../token/token.module';
import { JwtGuard } from './jwt.guard';

@Module({
  imports: [TokenModule],
  providers: [JwtGuard],
  exports: [JwtGuard, TokenModule],
})
export class GuardModule {}
