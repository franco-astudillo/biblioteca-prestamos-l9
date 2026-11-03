import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Producer, ProduceAcks, compatibilityPartitioner, stringSerializers } from '@platformatic/kafka';

export const PRODUCTOR = 'PRODUCTOR_KAFKA';
export type ProductorKafka = Producer<string, string, string, string>;

/** Crea el productor desde KAFKA_BROKERS. No se conecta hasta el primer envio. */
export const productorProvider: Provider = {
  provide: PRODUCTOR,
  inject: [ConfigService],
  useFactory: (config: ConfigService): ProductorKafka =>
    new Producer({
      clientId: 'biblioteca-prestamos',
      bootstrapBrokers: config.getOrThrow<string>('KAFKA_BROKERS').split(','),
      serializers: stringSerializers,
      idempotent: true,
      acks: ProduceAcks.ALL,                  // espera a todo el ISR
      retries: 10,                            // con un limite: asi un fallo se ve
      partitioner: compatibilityPartitioner,  // como el cliente de Java
      autocreateTopics: false,
    }),
};
