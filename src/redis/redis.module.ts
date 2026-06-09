import { Global, Module } from '@nestjs/common';
import { Redis } from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: () => new Redis(),
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
