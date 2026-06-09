import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserService } from '../user/user.service';
import * as bcrypt from 'bcrypt';
import { TokenService } from '../token/token.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
    @InjectQueue('email') private readonly emailQueue: Queue,
  ) {}

  async localLogin(email: string, password: string) {
    const user = await this.userService.getUserFromEmailWithPassword(email);

    if (!user || !user.password || user.loginType !== 'LOCAL')
      throw new UnauthorizedException('Invalid Credentials');

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new UnauthorizedException('Invalid Credentials');

    const tokens = await this.tokenService.generateTokens(user.id);
    const { password: _, ...rest } = user;

    return { user: rest, ...tokens };
  }

  async localSignup(name: string, email: string, password: string) {
    const existing = await this.userService.getUserFromEmail(email);
    if (existing) throw new ConflictException('Email already in use.');
    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = await this.userService.createLocalUser(
      name,
      email,
      hashedPassword,
    );
    const tokens = await this.tokenService.generateTokens(newUser.id);
    const verificationToken = await this.tokenService.generateVerificationToken(
      newUser.id,
    );
    await this.emailQueue.add('send-verification', {
      token: verificationToken,
      name: newUser.name,
      email: newUser.email,
    });
    return {
      user: newUser,
      ...tokens,
    };
  }
  async verifyEmail(token: string) {
    return this.prisma.$transaction(async (tx) => {
      const userId = await this.tokenService.verifyVerificationToken(token, tx);
      return this.userService.verifyUserEmail(userId, tx);
    });
  }
  async forgotPassword(email: string) {
    const user = await this.userService.getUserFromEmail(email);
    if (!user)
      return {
        message:
          'If an account with that email exists, a password reset link has been sent.',
      };
    const resetToken = await this.tokenService.generateResetToken(user.id);
    await this.emailQueue.add('send-reset', {
      name: user.name,
      email: user.email,
      token: resetToken,
    });
    return {
      message:
        'If an account with that email exists, a password reset link has been sent.',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    return await this.prisma.$transaction(async (tx) => {
      const userId = await this.tokenService.verifyResetToken(token, tx);
      return this.userService.updateUserPassword(userId, hashedPassword, tx);
    });
  }
}
