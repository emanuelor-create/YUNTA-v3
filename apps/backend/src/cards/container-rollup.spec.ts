import { Prisma } from '@prisma/client';
import { deriveContainer, syncBoardContainers, syncContainer } from './container-rollup';

const COLS = ['todo', 'doing', 'review', 'done'];
const D = (day: number) => new Date(`2026-09-${String(day).padStart(2, '0')}T12:00:00Z`);
const child = (columnId: string, progress: number, completedAt: Date | null = null) => ({ columnId, progress, completedAt });

describe('deriveContainer — el estado del contenedor sale de sus hijas', () => {
  it('sin ninguna hija hecha: avance 0 y va a la columna de la hija más atrasada', () => {
    const d = deriveContainer([child('todo', 0), child('todo', 0), child('todo', 0)], COLS);
    expect(d).toEqual({ columnId: 'todo', progress: 0, completedAt: null });
  });

  it('el avance es el promedio de las hijas, redondeado HACIA ABAJO a una etapa', () => {
    // (100 + 0 + 0) / 3 = 33,3 → 25
    expect(deriveContainer([child('done', 100, D(1)), child('todo', 0), child('todo', 0)], COLS).progress).toBe(25);
    // (100 + 0) / 2 = 50 → 50 exacto
    expect(deriveContainer([child('done', 100, D(1)), child('todo', 0)], COLS).progress).toBe(50);
    // (75 + 50) / 2 = 62,5 → 50 (no 75)
    expect(deriveContainer([child('review', 75), child('doing', 50)], COLS).progress).toBe(50);
    // (25 + 25) / 2 = 25
    expect(deriveContainer([child('doing', 25), child('doing', 25)], COLS).progress).toBe(25);
  });

  it('nunca llega a 100 mientras falte una hija: 93,75 es 75, no 100', () => {
    const d = deriveContainer([child('done', 100, D(1)), child('done', 100, D(2)), child('done', 100, D(3)), child('review', 75)], COLS);
    expect(d.progress).toBe(75);
    expect(d.completedAt).toBeNull();
    expect(d.columnId).toBe('review'); // no en "Hecho"
  });

  it('su columna es la de la hija ABIERTA más atrasada — una hecha no la arrastra ni la frena', () => {
    expect(deriveContainer([child('doing', 50), child('review', 75), child('done', 100, D(1))], COLS).columnId).toBe('doing');
    expect(deriveContainer([child('todo', 0), child('done', 100, D(1)), child('done', 100, D(2))], COLS).columnId).toBe('todo');
    expect(deriveContainer([child('review', 75), child('review', 75)], COLS).columnId).toBe('review');
  });

  it('todas hechas: va a la ÚLTIMA columna con 100 y completedAt = la última que se cerró (invariante 100 ⇔ última ⇔ completedAt)', () => {
    const d = deriveContainer([child('done', 100, D(3)), child('done', 100, D(7)), child('done', 100, D(5))], COLS);
    expect(d).toEqual({ columnId: 'done', progress: 100, completedAt: D(7) });
  });

  it('con una sola hija abierta, el contenedor es esa hija', () => {
    expect(deriveContainer([child('doing', 50)], COLS)).toEqual({ columnId: 'doing', progress: 50, completedAt: null });
  });

  it('una columna desconocida (ya borrada) cae a la primera en vez de romper', () => {
    expect(deriveContainer([child('borrada', 25)], COLS).columnId).toBe('todo');
  });

  it('exige hijas y columnas: sin ellas no hay nada que derivar', () => {
    expect(() => deriveContainer([], COLS)).toThrow();
    expect(() => deriveContainer([child('todo', 0)], [])).toThrow();
  });
});

describe('syncContainer', () => {
  let tx: { card: { findUnique: jest.Mock; update: jest.Mock; aggregate: jest.Mock; findMany: jest.Mock }; column: { findMany: jest.Mock } };
  const parent = (over: Record<string, unknown> = {}) => ({
    id: 'p1',
    columnId: 'todo',
    progress: 0,
    completedAt: null,
    column: { boardId: 'b1' },
    children: [child('todo', 0), child('todo', 0)],
    ...over,
  });

  beforeEach(() => {
    tx = {
      card: { findUnique: jest.fn().mockResolvedValue(parent()), update: jest.fn(), aggregate: jest.fn().mockResolvedValue({ _max: { position: 4 } }), findMany: jest.fn() },
      column: { findMany: jest.fn().mockResolvedValue(COLS.map((id) => ({ id }))) },
    };
  });
  const run = () => syncContainer(tx as unknown as Prisma.TransactionClient, 'p1');

  it('si el estado guardado ya es el derivado, no escribe nada', async () => {
    await run();
    expect(tx.card.update).not.toHaveBeenCalled();
  });

  it('una hija avanza: el contenedor cambia de avance y de columna, y va al final de la de destino', async () => {
    tx.card.findUnique.mockResolvedValue(parent({ children: [child('doing', 50), child('doing', 50)] }));
    await run();
    expect(tx.card.aggregate).toHaveBeenCalledWith({ where: { columnId: 'doing' }, _max: { position: true } });
    expect(tx.card.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { columnId: 'doing', progress: 50, completedAt: null, position: 5 },
    });
  });

  it('cambia solo el avance (misma columna): no toca la posición', async () => {
    tx.card.findUnique.mockResolvedValue(parent({ children: [child('todo', 25), child('todo', 25)] }));
    await run();
    expect(tx.card.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { columnId: 'todo', progress: 25, completedAt: null } });
  });

  it('todas las hijas hechas: el contenedor se cierra en la última columna', async () => {
    tx.card.findUnique.mockResolvedValue(parent({ children: [child('done', 100, D(4)), child('done', 100, D(6))] }));
    await run();
    expect(tx.card.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { columnId: 'done', progress: 100, completedAt: D(6), position: 5 } });
  });

  it('si ya estaba hecho y sigue hecho, conserva cuándo se cerró', async () => {
    const closed = D(2);
    tx.card.findUnique.mockResolvedValue(parent({ columnId: 'done', progress: 100, completedAt: closed, children: [child('done', 100, D(9)), child('done', 100, D(8))] }));
    await run();
    expect(tx.card.update).not.toHaveBeenCalled();
  });

  it('una hija se reabre: el contenedor vuelve a abierto y pierde completedAt', async () => {
    tx.card.findUnique.mockResolvedValue(parent({ columnId: 'done', progress: 100, completedAt: D(2), children: [child('done', 100, D(2)), child('review', 75)] }));
    await run();
    expect(tx.card.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ columnId: 'review', progress: 75, completedAt: null }) }));
  });

  it('una tarjeta sin hijas no es contenedor: no se toca', async () => {
    tx.card.findUnique.mockResolvedValue(parent({ children: [] }));
    await run();
    expect(tx.card.update).not.toHaveBeenCalled();
    expect(tx.column.findMany).not.toHaveBeenCalled();
  });

  it('syncBoardContainers recalcula todos los contenedores del tablero', async () => {
    tx.card.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    tx.card.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => parent({ id: where.id, children: [child('review', 75)], columnId: 'todo' }));
    await syncBoardContainers(tx as unknown as Prisma.TransactionClient, 'b1');
    expect(tx.card.findMany).toHaveBeenCalledWith({ where: { column: { boardId: 'b1' }, children: { some: {} } }, select: { id: true } });
    expect(tx.card.update).toHaveBeenCalledTimes(2);
  });
});
