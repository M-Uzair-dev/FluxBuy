import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';

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

  async generateTokens(id: string): Promise<{
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
    await this.prisma.token.create({
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
}
