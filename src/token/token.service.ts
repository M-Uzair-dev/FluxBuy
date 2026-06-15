import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { Interval } from '@nestjs/schedule';

@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  verifyJwt(token: string) {
    return this.jwt.verify(token);
  }

  async generateTokens(
    id: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const accessToken = this.jwt.sign(
      {
        sub: id,
        type: 'access',
      },
      {
        expiresIn: '15m',
      },
    );

    const refreshToken = this.jwt.sign(
      {
        sub: id,
      },
      {
        expiresIn: Number(this.config.getOrThrow('REFRESH_TOKEN_TTL_SECONDS')),
      },
    );
    const refreshTokenHash = createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    await tx.token.create({
      data: {
        tokenHash: refreshTokenHash,
        expiresAt: new Date(
          Date.now() +
            Number(this.config.getOrThrow('REFRESH_TOKEN_TTL_SECONDS')) * 1000,
        ),
        userId: id,
        type: 'REFRESH_TOKEN',
      },
    });
    return {
      accessToken,
      refreshToken,
    };
  }
  async generateVerificationToken(userId: string): Promise<string> {
    await this.prisma.token.deleteMany({
      where: {
        userId,
        type: 'VERIFICATION_TOKEN',
      },
    });
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await this.prisma.token.create({
      data: {
        type: 'VERIFICATION_TOKEN',
        tokenHash,
        expiresAt: new Date(
          Date.now() +
            Number(
              this.config.getOrThrow('EMAIL_VERIFICATION_TOKEN_TTL_SECONDS'),
            ) *
              1000,
        ),
        userId,
      },
    });
    return token;
  }

  async verifyVerificationToken(
    token: string,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const hashedToken = createHash('sha256').update(token).digest('hex');
    const tokenRecord = await tx.token.findFirst({
      where: {
        tokenHash: hashedToken,
        type: 'VERIFICATION_TOKEN',
      },
      select: {
        id: true,
        expiresAt: true,
        userId: true,
      },
    });
    if (!tokenRecord || tokenRecord.expiresAt < new Date())
      throw new BadRequestException('Invalid token! Verification Failed.');
    await tx.token.delete({
      where: {
        id: tokenRecord.id,
      },
    });
    return tokenRecord.userId;
  }

  async generateResetToken(userId: string): Promise<string> {
    await this.prisma.token.deleteMany({
      where: {
        userId,
        type: 'RESET_TOKEN',
      },
    });
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await this.prisma.token.create({
      data: {
        type: 'RESET_TOKEN',
        tokenHash,
        expiresAt: new Date(
          Date.now() +
            Number(this.config.getOrThrow('PASSWORD_RESET_TOKEN_TTL_SECONDS')) *
              1000,
        ),
        userId,
      },
    });
    return token;
  }
  async verifyResetToken(token: string, tx: Prisma.TransactionClient) {
    const hashedToken = createHash('sha256').update(token).digest('hex');
    const tokenRecord = await tx.token.findFirst({
      where: {
        tokenHash: hashedToken,
        type: 'RESET_TOKEN',
      },
      select: {
        id: true,
        expiresAt: true,
        userId: true,
      },
    });
    if (!tokenRecord || tokenRecord.expiresAt < new Date())
      throw new BadRequestException('Invalid token! Password Reset Failed.');
    await tx.token.delete({
      where: {
        id: tokenRecord.id,
      },
    });
    return tokenRecord.userId;
  }
  async deleteAllRefreshTokens(userId: string) {
    await this.prisma.token.deleteMany({
      where: {
        userId,
        type: 'REFRESH_TOKEN',
      },
    });
  }
  async rotateTokens(refreshToken: string) {
    let decoded;
    try {
      decoded = await this.jwt.verify(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid Refresh Token! Please Login.');
    }
    const hashed = createHash('sha256').update(refreshToken).digest('hex');
    let tokenRecord = await this.prisma.token.findFirst({
      where: {
        tokenHash: hashed,
        type: 'REFRESH_TOKEN',
      },
    });
    if (!tokenRecord) {
      await this.deleteAllRefreshTokens(decoded.sub);
      throw new UnauthorizedException('Invalid Token! Please Login.');
    }
    if (tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid Token! Please Login.');
    }
    return await this.prisma.$transaction(async (tx) => {
      await tx.token.delete({
        where: {
          id: tokenRecord.id,
        },
      });
      return this.generateTokens(decoded.sub, tx);
    });
  }

  @Interval(Number(process.env.TOKEN_CLEANUP_CRON_INTERVAL_MS) || 600000)
  async cleanTokens() {
    await this.prisma.token.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
  }
}
