import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}
  addProduct(
    name: string,
    price: number,
    quantity: number,
    userId: string,
    dropTime: Date,
    description?: string,
    imageUrl?: string,
  ) {
    if (dropTime <= new Date())
      throw new BadRequestException('Drop time must be in the future.');
    return this.prisma.product.create({
      data: {
        name,
        price,
        quantity,
        userId,
        dropTime,
        description,
        imageUrl,
      },
    });
  }
  async getProducts(pageSize = 10, cursor?: string) {
    const products = await this.prisma.product.findMany({
      take: pageSize + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : undefined,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            name: true,
            pfp: true,
          },
        },
      },
    });

    const hasNextPage = products.length > pageSize;

    if (!hasNextPage) {
      return {
        products,
        nextCursor: null,
      };
    }

    const nextItem = products.pop();

    return {
      products,
      nextCursor: nextItem!.id,
    };
  }
  getProductById(id: string) {
    return this.prisma.product.findUnique({
      where: {
        id,
      },
      include: {
        user: {
          select: {
            name: true,
            pfp: true,
          },
        },
      },
    });
  }
  async editProduct(
    name: string | undefined,
    description: string | undefined,
    imageUrl: string | undefined,
    userId: string,
    productId: string,
  ) {
    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
      },
    });
    if (!product) throw new NotFoundException('Product not found!');
    if (product.userId !== userId)
      throw new ForbiddenException('Unable to edit product.');
    return this.prisma.product.update({
      where: {
        id: productId,
      },
      data: {
        name,
        description,
        imageUrl,
      },
    });
  }
}
