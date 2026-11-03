import { Module } from '@nestjs/common';
import { productorProvider } from './productor.provider.js';
import { PublicadorKafkaService } from './publicador-kafka.service.js';

@Module({
  providers: [productorProvider, PublicadorKafkaService],
  exports: [PublicadorKafkaService],
})
export class KafkaModule {}
