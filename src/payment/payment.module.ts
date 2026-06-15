import { Module } from '@nestjs/common';

@Module({
  providers: [PaymentModule],
  exports: [PaymentModule],
})
export class PaymentModule {}
