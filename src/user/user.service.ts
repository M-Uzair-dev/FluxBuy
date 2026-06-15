import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  getUserFromEmail(email: string) {
    return this.prisma.user.findUnique({
      where: {
        email,
      },
      omit: {
        password: true,
      },
    });
  }
  getUserFromEmailWithPassword(email: string) {
    return this.prisma.user.findUnique({
      where: {
        email,
      },
    });
  }
  getUserFromId(id: string) {
    return this.prisma.user.findUnique({
      where: {
        id,
      },
      omit: {
        password: true,
      },
    });
  }
  createLocalUser(name: string, email: string, hashedPassword: string) {
    return this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
      },
      omit: {
        password: true,
      },
    });
  }
  async verifyUserEmail(userId: string, tx: Prisma.TransactionClient) {
    return tx.user.update({
      where: {
        id: userId,
      },
      data: {
        emailVerified: true,
      },
      select: {
        id: true,
        emailVerified: true,
      },
    });
  }
  async updateUserPassword(
    userId: string,
    hashedNewPassword: string,
    tx: Prisma.TransactionClient,
  ) {
    return await tx.user.update({
      where: {
        id: userId,
      },
      data: {
        password: hashedNewPassword,
      },
      omit: {
        password: true,
      },
    });
  }
  getUserFromGoogleId(googleId: string) {
    return this.prisma.user.findUnique({
      where: {
        googleId,
      },
      omit: {
        password: true,
      },
    });
  }
  updateUsersGoogleId(userId: string, googleId: string) {
    return this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        googleId,
        emailVerified: true,
      },
      omit: {
        password: true,
      },
    });
  }
  createGoogleUser(name: string, email: string, googleId: string) {
    return this.prisma.user.create({
      data: {
        name,
        email,
        googleId,
        emailVerified: true,
      },
      omit: {
        password: true,
      },
    });
  }
}
