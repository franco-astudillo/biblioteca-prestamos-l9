import { Type } from 'class-transformer';
import { Equals, IsDefined, IsIn, IsISO8601, IsNotEmpty, IsString, IsUUID, Matches, ValidateIf, ValidateNested } from 'class-validator';

export const TIPOS = ['prestamo.creado', 'prestamo.devuelto'] as const;
export type TipoEvento = (typeof TIPOS)[number];

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class DatosPrestamoCreadoDto {
  @IsString()
  @IsNotEmpty()
  prestamoId!: string;

  @Matches(FECHA, { message: 'desde tiene que ser una fecha AAAA-MM-DD' })
  @IsISO8601({ strict: true })
  desde!: string;

  @Matches(FECHA, { message: 'hasta tiene que ser una fecha AAAA-MM-DD' })
  @IsISO8601({ strict: true })
  hasta!: string;
}

export class DatosPrestamoDevueltoDto {
  @IsString()
  @IsNotEmpty()
  prestamoId!: string;
}

/**
 * El sobre de todo evento (contrato de la unidad 3). Se valida ANTES de enviar: un evento que no
 * cumple no llega a Kafka. `libroId` viaja como string, igual que el resto de los eventos del sistema.
 */
export class EventoDto {
  @IsUUID()
  eventoId!: string;

  @IsIn(TIPOS)
  tipo!: TipoEvento;

  @Equals(1, { message: 'version tiene que ser 1' })
  version!: number;

  @IsISO8601({ strict: true })
  emitidoEn!: string;

  @IsString()
  @IsNotEmpty()
  libroId!: string;

  @IsString()
  @IsNotEmpty()
  usuarioSub!: string;

  // Los datos dependen del tipo. Si el tipo no existe, ya falla `tipo` y aqui no se valida nada mas.
  @ValidateIf((e: EventoDto) => TIPOS.includes(e.tipo))
  @IsDefined()
  @ValidateNested()
  @Type((opciones) =>
    opciones?.object?.tipo === 'prestamo.devuelto' ? DatosPrestamoDevueltoDto : DatosPrestamoCreadoDto,
  )
  datos!: DatosPrestamoCreadoDto | DatosPrestamoDevueltoDto;
}
