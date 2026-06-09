import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from '../user/user.module';
import { TokenModule } from '../token/token.module';
import { JwtGuard } from '../guards/jwt.guard';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    UserModule,
    TokenModule,
    BullModule.registerQueue({ name: 'email' }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
