import { Module } from '@nestjs/common';
import { TokenModule } from '../token/token.module';
import { JwtGuard } from './jwt.guard';
import { GoogleAuthGuard } from './google.guard';

@Module({
  imports: [TokenModule],
  providers: [JwtGuard, GoogleAuthGuard],
  exports: [JwtGuard, TokenModule, GoogleAuthGuard],
})
export class GuardModule {}
