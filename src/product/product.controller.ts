import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtGuard } from '../guards/jwt.guard';
import CurrentUserId from '../decorators/currentUser.decorator';
import { CreateProductDto } from './dto/createProduct.dto';
import { ProductService } from './product.service';
import { GetProductsDto } from './dto/getProducts.dto';
import { EditProductDto } from './dto/editProduct.dto';
import { CacheInterceptor } from '@nestjs/cache-manager';

@Controller('product')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @UseGuards(JwtGuard)
  @Post('/new')
  addProduct(@CurrentUserId() id: string, @Body() data: CreateProductDto) {
    return this.productService.addProduct(
      data.name,
      data.price,
      data.quantity,
      id,
      data.dropTime,
      data.description,
      data.imageUrl,
    );
  }

  @UseInterceptors(CacheInterceptor)
  @Get('/')
  getProducts(@Query() data: GetProductsDto) {
    return this.productService.getProducts(data.limit, data.next);
  }

  @UseGuards(JwtGuard)
  @Patch('/:id')
  editProduct(
    @CurrentUserId() userId: string,
    @Body() data: EditProductDto,
    @Param('id') id: string,
  ) {
    return this.productService.editProduct(
      data.name,
      data.description,
      data.imageUrl,
      userId,
      id,
    );
  }

  @UseInterceptors(CacheInterceptor)
  @Get('/:id')
  getSingleProduct(@Param('id') id: string) {
    const product = this.productService.getProductById(id);
    if (!product) throw new NotFoundException('Product not found!');
    return product;
  }
}
