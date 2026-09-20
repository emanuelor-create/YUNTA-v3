/// Las fotos diarias se etiquetan con el día que se cerró, en UNA zona horaria
/// fija (la de la cuenta), no la del navegador de quien mira: si cada cliente
/// contara "ayer" a su manera, dos personas leerían series distintas.
export const SNAPSHOT_TIME_ZONE = process.env.SNAPSHOT_TIME_ZONE ?? 'America/Argentina/Buenos_Aires';

const DAY_MS = 24 * 60 * 60 * 1000;

/// 'YYYY-MM-DD' de un instante en una zona horaria.
export function ymdInTimeZone(date: Date, timeZone = SNAPSHOT_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/// Una columna DATE de Postgres llega como medianoche UTC de ese día.
export const dateColumn = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);

/// El día que acaba de cerrarse a las 00:00 (zona de la cuenta): la foto que
/// toma el job a la medianoche del 21 es la del 20.
export function closedDay(now: Date, timeZone = SNAPSHOT_TIME_ZONE): string {
  // Hoy en la zona de la cuenta, menos un día: no depende de la hora en que
  // corra el job (a las 00:00:05 o a las 15:00 el día cerrado es el mismo).
  const today = dateColumn(ymdInTimeZone(now, timeZone));
  return new Date(today.getTime() - DAY_MS).toISOString().slice(0, 10);
}

/// Los `count` días cerrados que terminan en el último cerrado, del más viejo
/// al más nuevo.
export function lastClosedDays(now: Date, count: number, timeZone = SNAPSHOT_TIME_ZONE): Date[] {
  const last = dateColumn(closedDay(now, timeZone)).getTime();
  return Array.from({ length: count }, (_, i) => new Date(last - (count - 1 - i) * DAY_MS));
}
