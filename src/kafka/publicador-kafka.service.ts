import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { aMensaje } from './a-mensaje.js';
import { EventoDto, TipoEvento } from './evento.dto.js';
import { PRODUCTOR, type ProductorKafka } from './productor.provider.js';

/**
 * Publica prestamo.creado y prestamo.devuelto en biblioteca.prestamos. Se llama DESPUES de guardar en
 * Postgres y ADEMAS de RabbitMQ: no reemplaza a nada.
 *
 * Si Kafka no responde, el prestamo ya existe: se registra el error y la peticion sigue en 201, igual que
 * con RabbitMQ. El productor reintenta 10 veces (con `retries`), asi que el fallo tarda unos segundos y
 * no cuelga la peticion. El evento perdido no se recupera hasta la E3.
 */
@Injectable()
export class PublicadorKafkaService implements OnModuleDestroy {
  private readonly log = new Logger('prestamos');

  constructor(@Inject(PRODUCTOR) private readonly productor: ProductorKafka) {}

  async publicar(
    tipo: TipoEvento,
    libroId: number,
    usuarioSub: string,
    datos: Record<string, unknown>,
  ): Promise<void> {
    const evento = plainToInstance(EventoDto, {
      eventoId: randomUUID(),
      tipo,
      version: 1,
      emitidoEn: new Date().toISOString(),
      libroId: String(libroId),
      usuarioSub,
      datos,
    });

    try {
      const errores = await validate(evento, { whitelist: true, forbidNonWhitelisted: true });
      if (errores.length > 0) {
        throw new Error(`el evento no cumple el DTO: ${errores.map((e) => e.toString(false, true)).join(' | ')}`);
      }
      // en el servicio, despues de guardar:
      const resultado = await this.productor.send({ messages: [aMensaje(evento)] });
      const o = resultado.offsets?.[0];
      this.log.log(`kafka: ${tipo} evento ${evento.eventoId} en ${o?.topic}[${o?.partition}] offset ${o?.offset}`);
    } catch (error) {
      this.log.error(`kafka: no se pudo publicar ${tipo} evento ${evento.eventoId}: ${detalle(error)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.productor.close().catch(() => undefined);
  }
}

// El cliente anida los errores (`errors`): el de arriba solo dice "Producing messages failed" y el motivo real
// esta en las hojas, repetido una vez por intento. Se juntan sin repetir.
function detalle(error: unknown): string {
  type Anidado = { message?: string; errors?: Anidado[] };
  const motivos = new Set<string>();
  const recorrer = (e: Anidado): void => {
    if (e.errors?.length) e.errors.forEach(recorrer);
    else motivos.add(e.message ?? String(e));
  };
  recorrer(error as Anidado);
  return `${(error as Anidado).message ?? 'error'} (${[...motivos].join('; ')})`;
}
