import {
  ConflictException,
  Inject,
  Injectable,
  Redirect,
  UnauthorizedException,
} from '@nestjs/common';
import { UserService } from '../user/user.service';
import { TokenService } from '../token/token.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
    @InjectQueue('email') private readonly emailQueue: Queue,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async localLogin(email: string, password: string) {
    const user = await this.userService.getUserFromEmailWithPassword(email);

    if (!user || !user.password)
      throw new UnauthorizedException('Invalid Credentials');

    const match = await argon2.verify(user.password, password);
    if (!match) throw new UnauthorizedException('Invalid Credentials');

    const tokens = await this.tokenService.generateTokens(user.id);
    const { password: _, ...rest } = user;

    return { user: rest, ...tokens };
  }

  async localSignup(name: string, email: string, password: string) {
    const existing = await this.userService.getUserFromEmail(email);
    if (existing) throw new ConflictException('Email already in use.');
    const hashedPassword = await argon2.hash(password);
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
    const hashedPassword = await argon2.hash(newPassword);
    return await this.prisma.$transaction(async (tx) => {
      const userId = await this.tokenService.verifyResetToken(token, tx);
      return this.userService.updateUserPassword(userId, hashedPassword, tx);
    });
  }
  async refreshTokens(refreshToken: string) {
    return this.tokenService.rotateTokens(refreshToken);
  }
  async googleLogin(googleUser: {
    googleId: string;
    email: string;
    name: string;
    profileImage: string | null;
  }) {
    let user = await this.userService.getUserFromGoogleId(googleUser.googleId);

    if (!user) {
      const existingUser = await this.userService.getUserFromEmail(
        googleUser.email,
      );

      if (existingUser) {
        user = await this.userService.updateUsersGoogleId(
          existingUser.id,
          googleUser.googleId,
        );
      } else {
        user = await this.userService.createGoogleUser(
          googleUser.name,
          googleUser.email,
          googleUser.googleId,
        );
      }
    }
    const tokens = await this.tokenService.generateTokens(user.id);
    const uid = crypto.randomUUID();

    const key = `tokens-uid-${uid}`;

    await this.redis.set(key, JSON.stringify(tokens), 'EX', 60);
    return `${this.config.getOrThrow('FRONTEND_URL')}/auth/google/${uid}`;
  }
  async getTokens(uid: string) {
    const key = `tokens-uid-${uid}`;

    const tokens = await this.redis.get(key);
    if (!tokens)
      throw new UnauthorizedException('Invalid uid, please login again!');
    await this.redis.del(key);
    return JSON.parse(tokens);
  }
}
