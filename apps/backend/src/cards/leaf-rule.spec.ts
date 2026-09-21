import * as fs from 'fs';
import * as path from 'path';

/// SOLO CUENTAN LAS HOJAS (cards/card-metrics.ts, `LEAF`). Una tarjeta dividida
/// no entra en ninguna métrica: cuentan sus hijas. Si una consulta que cuenta
/// tarjetas se olvida del filtro, el trabajo de cada tarjeta dividida se cuenta
/// dos veces (el padre y sus hijas) y nadie lo nota hasta que los totales de dos
/// pantallas dejan de coincidir.
///
/// Este test recorre el código: toda lectura de `card` / `cardAssignee` tiene que
/// llevar `LEAF` o declarar con `leaf-ok: <motivo>` por qué no cuenta (orden de
/// posiciones, derivación de un contenedor, etc.).
const SRC = path.resolve(__dirname, '..');
const READ = /\.(card|cardAssignee)\.(findMany|count|aggregate|groupBy)\(/g;
const WINDOW = 900;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [full] : [];
  });
}

describe('regla de hojas — toda consulta que cuenta tarjetas filtra contenedores', () => {
  const offenders: string[] = [];
  let reads = 0;

  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(READ)) {
      reads += 1;
      const window = text.slice(Math.max(0, match.index! - 300), match.index! + WINDOW);
      if (!window.includes('LEAF') && !window.includes('leaf-ok')) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${path.relative(SRC, file)}:${line}  ${match[0]}`);
      }
    }
  }

  it('encontró las consultas (si esto da 0 el test dejó de mirar)', () => {
    expect(reads).toBeGreaterThanOrEqual(10);
  });

  it('ninguna consulta de tarjetas se saltea el filtro LEAF sin declararlo', () => {
    expect(offenders).toEqual([]);
  });
});
