import { Module } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard.js';
import { KafkaModule } from '../kafka/kafka.module.js';
import { MensajeriaModule } from '../mensajeria/mensajeria.module.js';
import { PrestamosController } from './prestamos.controller.js';
import { PrestamosRepositorio } from './prestamos.repositorio.js';

@Module({
  imports: [MensajeriaModule, KafkaModule],
  controllers: [PrestamosController],
  providers: [PrestamosRepositorio, JwtGuard],
})
export class PrestamosModule {}
