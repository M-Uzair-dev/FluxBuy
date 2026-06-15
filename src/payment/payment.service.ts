import { Injectable } from '@nestjs/common';

@Injectable()
export class PaymentService {
  private readonly failureRate = 0.2; // Fails 20% of the times.
  private readonly delayMs = 1000; // min 1s of delay
  private readonly delayBuffer = 3000; // at max 3s of buffer in each delay

  async chargeCard(
    cardNumber: string,
    cvc: number,
    expireDate: Date,
    amount: number,
    idempotencyKey: string,
  ) {
    return new Promise((resolve) => {
      setTimeout(
        () => {
          if (Math.random() < this.failureRate || expireDate < new Date())
            resolve(false);
          else resolve(true);
        },
        this.delayMs + Math.random() * this.delayBuffer,
      );
    });
  }
}
