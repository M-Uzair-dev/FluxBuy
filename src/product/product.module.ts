import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { GuardModule } from '../guards/guard.module';

@Module({
  imports: [GuardModule],
  controllers: [ProductController],
  providers: [ProductService],
})
export class ProductModule {}
