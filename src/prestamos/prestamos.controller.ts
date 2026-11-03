import {
  All, BadRequestException, Body, ConflictException, Controller, Delete, Get, Logger, NotFoundException,
  Param, Post, Req, ServiceUnavailableException, UseGuards, MethodNotAllowedException,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard.js';
import { PublicadorKafkaService } from '../kafka/publicador-kafka.service.js';
import { PublicadorService } from '../mensajeria/publicador.service.js';
import { ROUTING_KEYS } from '../mensajeria/topologia.js';
import { CrearPrestamoDto } from './dto/crear-prestamo.dto.js';
import { PrestamosRepositorio } from './prestamos.repositorio.js';

// El BFF llama a la raiz (http://prestamos:3002) y el gateway a /prestamos: las dos rutas valen.
const RAIZ = ['', 'prestamos'];

/**
 * El contrato HTTP de siempre:
 *   GET    /, /prestamos          200  lista de prestamos (sin token)
 *   POST   /, /prestamos          201  crea; 401 sin token, 400 cuerpo invalido, 409 duplicado
 *   DELETE /:id, /prestamos/:id   200  marca devuelto; 401 sin token, 404 si no existe
 *   cualquier otro metodo         405
 * Con 503 cuando Postgres no responde.
 */
@Controller()
export class PrestamosController {
  private readonly log = new Logger('prestamos');

  constructor(
    private readonly prestamos: PrestamosRepositorio,
    private readonly publicador: PublicadorService,
    private readonly kafka: PublicadorKafkaService,
  ) {}

  @Get(RAIZ)
  async listar() {
    try {
      return await this.prestamos.listar();
    } catch (error) {
      this.log.error(`no se pudo listar: ${mensajeDe(error)}`);
      throw new ServiceUnavailableException('la base de datos no responde');
    }
  }

  @Post(RAIZ)
  @UseGuards(JwtGuard)
  async crear(@Req() req: { sub: string }, @Body() cuerpo: CrearPrestamoDto) {
    let nuevo;
    try {
      nuevo = await this.prestamos.crear({
        libroId: cuerpo.libroId,
        usuarioSub: req.sub,                    // sale del TOKEN, nunca del cuerpo
        desde: cuerpo.desde,
        hasta: cuerpo.hasta,
      });
    } catch (error) {
      const codigo = (error as { code?: string }).code ?? '';
      if (codigo === '23505') throw new ConflictException('ya tienes un prestamo vigente de ese libro');
      if (/^2[23]/.test(codigo)) throw new BadRequestException((error as Error).message);
      this.log.error(`no se pudo guardar: ${mensajeDe(error)}`);
      throw new ServiceUnavailableException('la base de datos no responde');
    }

    // Publica el que escribe, y despues de escribir.
    this.publicador.publicar(ROUTING_KEYS.prestamoCreado, {
      prestamoId: nuevo.id,
      libroId: nuevo.libroId,
      usuarioSub: req.sub,
      hasta: nuevo.hasta,
    });
    // Se publica despues de persistir y ademas de RabbitMQ.
    await this.kafka.publicar('prestamo.creado', nuevo.libroId, req.sub, {
      prestamoId: String(nuevo.id),
      desde: nuevo.desde,
      hasta: nuevo.hasta,
    });
    return nuevo;
  }

  @Delete([':id', 'prestamos/:id'])
  @UseGuards(JwtGuard)
  async devolver(@Req() req: { sub: string }, @Param('id') idCrudo: string) {
    const id = Number(idCrudo);
    let prestamo;
    try {
      prestamo = Number.isInteger(id) ? await this.prestamos.devolver(id) : null;
    } catch (error) {
      this.log.error(`no se pudo devolver: ${mensajeDe(error)}`);
      throw new ServiceUnavailableException('la base de datos no responde');
    }
    if (!prestamo) throw new NotFoundException(`no existe el prestamo ${id}`);

    this.publicador.publicar(ROUTING_KEYS.prestamoDevuelto, {
      prestamoId: prestamo.id,
      libroId: prestamo.libroId,
      usuarioSub: req.sub,
    });
    // La key pertenece al lector, aunque devuelva el libro un bibliotecario.
    await this.kafka.publicar('prestamo.devuelto', prestamo.libroId, prestamo.usuarioSub, {
      prestamoId: String(prestamo.id),
    });
    return prestamo;
  }

  // Lo ultimo que se registra: lo que no calzo con GET, POST ni DELETE.
  @All('{*ruta}')
  noSoportado(@Req() req: { method: string }) {
    throw new MethodNotAllowedException(`metodo ${req.method} no soportado`);
  }
}

const mensajeDe = (error: unknown) => (error as { message?: string; code?: string }).message || (error as { code?: string }).code;
