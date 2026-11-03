import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { aMensaje } from './a-mensaje.js';
import { EventoDto } from './evento.dto.js';

const sobre = (cambios: object = {}) =>
  plainToInstance(EventoDto, {
    eventoId: '0f8c2a4e-1111-4222-8333-444455556666',
    tipo: 'prestamo.creado',
    version: 1,
    emitidoEn: '2026-11-02T12:00:00.000Z',
    libroId: '7',
    usuarioSub: 'a1b2c3d4-0000-4000-8000-000000000001',
    datos: { prestamoId: '12', desde: '2026-11-02', hasta: '2026-11-16' },
    ...cambios,
  });

const errores = async (evento: EventoDto) => validate(evento, { whitelist: true, forbidNonWhitelisted: true });

describe('aMensaje', () => {
  it('pone el usuarioSub como key y los tres headers', () => {
    const evento = sobre();
    const m = aMensaje(evento, 'corr-1');
    expect(m.topic).toBe('biblioteca.prestamos');
    expect(m.key).toBe(evento.usuarioSub);
    expect(m.headers).toEqual({
      'x-evento-id': evento.eventoId,
      'x-correlation-id': 'corr-1',
      'content-type': 'application/json',
    });
    expect(JSON.parse(m.value).libroId).toBe('7');
  });
});

describe('EventoDto', () => {
  it('acepta prestamo.creado y prestamo.devuelto', async () => {
    expect(await errores(sobre())).toHaveLength(0);
    expect(await errores(sobre({ tipo: 'prestamo.devuelto', datos: { prestamoId: '12' } }))).toHaveLength(0);
  });

  it('rechaza version 99, un campo faltante y un libroId numerico', async () => {
    expect(await errores(sobre({ version: 99 }))).not.toHaveLength(0);
    expect(await errores(sobre({ usuarioSub: undefined }))).not.toHaveLength(0);
    expect(await errores(sobre({ libroId: 7 }))).not.toHaveLength(0);
  });

  it('rechaza datos que no corresponden al tipo', async () => {
    expect(await errores(sobre({ datos: { prestamoId: '12' } }))).not.toHaveLength(0);
    expect(await errores(sobre({ tipo: 'otra.cosa' }))).not.toHaveLength(0);
    expect(await errores(sobre({ datos: undefined }))).not.toHaveLength(0);
    expect(await errores(sobre({ datos: null }))).not.toHaveLength(0);
  });
});
