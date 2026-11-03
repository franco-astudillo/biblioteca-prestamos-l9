import 'reflect-metadata';
import { vi } from 'vitest';
import { PrestamosController } from './prestamos.controller.js';
import { PrestamosRepositorio } from './prestamos.repositorio.js';
import { PublicadorService } from '../mensajeria/publicador.service.js';
import { PublicadorKafkaService } from '../kafka/publicador-kafka.service.js';

describe('persistencia y publicacion del prestamo', () => {
  const prestamo = { id: 12, libroId: 7, usuarioSub: 'dueno', desde: '2026-11-02', hasta: '2026-11-16', devuelto: false };
  const preparar = () => {
    const pasos: string[] = [];
    const repositorio = {
      crear: vi.fn(async () => { pasos.push('postgres'); return prestamo; }),
      devolver: vi.fn(async () => ({ ...prestamo, devuelto: true })),
    };
    const rabbit = { publicar: vi.fn(() => pasos.push('rabbit')) };
    const kafka = { publicar: vi.fn(async () => { pasos.push('kafka'); }) };
    const controller = new PrestamosController(
      repositorio as unknown as PrestamosRepositorio,
      rabbit as unknown as PublicadorService,
      kafka as unknown as PublicadorKafkaService,
    );
    return { controller, repositorio, rabbit, kafka, pasos };
  };

  it('persiste antes de publicar en RabbitMQ y Kafka', async () => {
    const { controller, kafka, pasos } = preparar();
    const respuesta = await controller.crear({ sub: 'dueno' }, { libroId: 7, desde: prestamo.desde, hasta: prestamo.hasta });
    expect(respuesta).toEqual(prestamo);
    expect(pasos).toEqual(['postgres', 'rabbit', 'kafka']);
    expect(kafka.publicar).toHaveBeenCalledWith('prestamo.creado', 7, 'dueno', {
      prestamoId: '12', desde: prestamo.desde, hasta: prestamo.hasta,
    });
  });

  it('no emite eventos si Postgres rechaza la escritura', async () => {
    const { controller, repositorio, rabbit, kafka } = preparar();
    repositorio.crear.mockRejectedValueOnce(Object.assign(new Error('duplicado'), { code: '23505' }));
    await expect(controller.crear({ sub: 'dueno' }, { libroId: 7, desde: prestamo.desde, hasta: prestamo.hasta })).rejects.toThrow('ya tienes');
    expect(rabbit.publicar).not.toHaveBeenCalled();
    expect(kafka.publicar).not.toHaveBeenCalled();
  });

  it('devuelve con la key del dueno aunque actue un bibliotecario', async () => {
    const { controller, kafka } = preparar();
    await controller.devolver({ sub: 'bibliotecario' }, '12');
    expect(kafka.publicar).toHaveBeenCalledWith('prestamo.devuelto', 7, 'dueno', { prestamoId: '12' });
  });
});
