import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from '../user/user.module';
import { TokenModule } from '../token/token.module';
import { BullModule } from '@nestjs/bullmq';
import { PassportModule } from '@nestjs/passport';
import { GoogleStrategy } from './strategies/google.strategy';
import { GuardModule } from '../guards/guard.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    UserModule,
    TokenModule,
    BullModule.registerQueue({ name: 'email' }),
    PassportModule.register({ defaultStrategy: 'google' }),
    GuardModule,
    RedisModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, GoogleStrategy],
})
export class AuthModule {}
