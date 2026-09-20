import { BadRequestException } from '@nestjs/common';

/// Paleta de marca de los proyectos: los mismos 5 hex que AVATAR_PALETTE del
/// front (ver el comentario de Project.color en el schema).
export const PROJECT_COLORS = ['#1b1917', '#b4552f', '#8a5a2b', '#5c564d', '#8a8378'] as const;

/// "" y null limpian la fecha; un valor que no parsea es un 400.
export function parseProjectDate(field: string, value: string | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${field} no es una fecha válida`);
  }
  return parsed;
}

export function assertDateOrder(startDate: Date | null, endDate: Date | null): void {
  if (startDate && endDate && endDate < startDate) {
    throw new BadRequestException('La fecha de fin no puede ser anterior a la de inicio');
  }
}
