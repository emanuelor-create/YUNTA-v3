/// Prefijo del código de tarjeta ("RED" → RED-12): las primeras 3 letras del
/// nombre, sin acentos y en mayúsculas. Es la misma regla que el backfill de la
/// migración 20260920180000, para que un proyecto creado ayer y uno creado hoy
/// se rijan igual.
export function deriveProjectKey(name: string): string {
  const letters = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // saca los acentos: "Migración" → "Migracion"
    .replace(/ñ/gi, 'n')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
  return letters.slice(0, 3) || 'PRJ';
}

/// La primera clave libre a partir del prefijo: RED, RED2, RED3… Recibe las
/// claves ya usadas con ese prefijo (una consulta), no consulta una por una.
export function firstFreeKey(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(prefix)) return prefix;
  for (let n = 2; ; n += 1) {
    if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
  }
}

export const cardCode = (key: string, number: number) => `${key}-${number}`;
