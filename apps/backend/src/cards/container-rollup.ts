import { Prisma } from '@prisma/client';

/// Una tarjeta dividida en subtareas es un CONTENEDOR. No tiene avance ni
/// columna propios: se DERIVAN de sus hijas, con una sola regla, acá. Un solo
/// hecho, un solo lugar.
///
/// Se guarda (columnId / progress / completedAt del contenedor) para que el
/// tablero y las consultas por columna sigan funcionando sin saber de
/// contenedores, pero el valor sale siempre de `deriveContainer` y se
/// recalcula cada vez que cambia algo de las hijas (mover, cambiar el avance,
/// crear, reordenar columnas). Ninguna métrica lo lee: los contenedores no
/// cuentan, solo las hojas.

const STAGES = [0, 25, 50, 75, 100] as const;

export interface ChildState {
  progress: number;
  completedAt: Date | null;
  columnId: string;
}

export interface DerivedContainer {
  columnId: string;
  progress: number;
  completedAt: Date | null;
}

/// Reglas:
///  · Está hecho SOLO si todas las hijas están hechas — y entonces vive en la
///    última columna con avance 100 (la invariante de BACKEND.md §2 vale igual
///    para contenedores: 100 ⇔ última columna ⇔ completedAt).
///  · Su avance es el promedio de las hijas, redondeado HACIA ABAJO a una de las
///    cinco etapas y sin llegar a 100 mientras falte una hija (93,75 es 75, no
///    100): no puede figurar terminado con trabajo abierto.
///  · Su columna es la de la hija abierta MÁS ATRASADA: un contenedor no avanza
///    más que su pieza más lenta.
export function deriveContainer(children: ChildState[], columnIds: string[]): DerivedContainer {
  if (!children.length) throw new Error('deriveContainer necesita al menos una hija');
  if (!columnIds.length) throw new Error('deriveContainer necesita las columnas del tablero');

  const open = children.filter((child) => child.completedAt === null);
  if (!open.length) {
    const latest = children.reduce((max, child) => (child.completedAt! > max ? child.completedAt! : max), children[0].completedAt!);
    return { columnId: columnIds[columnIds.length - 1], progress: 100, completedAt: latest };
  }

  const mean = children.reduce((sum, child) => sum + child.progress, 0) / children.length;
  const progress = [...STAGES].reverse().find((stage) => stage < 100 && stage <= mean) ?? 0;

  const rank = (columnId: string) => Math.max(0, columnIds.indexOf(columnId));
  const behind = open.reduce((min, child) => (rank(child.columnId) < rank(min.columnId) ? child : min), open[0]);
  return { columnId: columnIds[rank(behind.columnId)], progress, completedAt: null };
}

/// Recalcula y guarda el estado derivado de un contenedor. No hace nada si la
/// tarjeta no tiene hijas. Va dentro de la transacción de lo que cambió a las hijas.
export async function syncContainer(tx: Prisma.TransactionClient, parentId: string): Promise<void> {
  const parent = await tx.card.findUnique({
    where: { id: parentId },
    select: {
      id: true,
      columnId: true,
      progress: true,
      completedAt: true,
      column: { select: { boardId: true } },
      children: { select: { progress: true, completedAt: true, columnId: true } },
    },
  });
  if (!parent || !parent.children.length) return;

  const columns = await tx.column.findMany({ where: { boardId: parent.column.boardId }, orderBy: { position: 'asc' }, select: { id: true } });
  if (!columns.length) return;
  const derived = deriveContainer(parent.children, columns.map((column) => column.id));

  const columnChanged = derived.columnId !== parent.columnId;
  const doneChanged = (derived.completedAt === null) !== (parent.completedAt === null);
  if (!columnChanged && !doneChanged && derived.progress === parent.progress) return;

  // Al cambiar de columna va al final de la de destino. Queda un hueco en la de
  // origen: las posiciones solo tienen que ser únicas, y `move` renumera de todos modos.
  let position: number | undefined;
  if (columnChanged) {
    // leaf-ok: calcula una posición de orden en la columna, no cuenta trabajo.
    const last = await tx.card.aggregate({ where: { columnId: derived.columnId }, _max: { position: true } });
    position = (last._max.position ?? -1) + 1;
  }

  await tx.card.update({
    where: { id: parentId },
    data: {
      columnId: derived.columnId,
      progress: derived.progress,
      // Si ya estaba hecho y sigue hecho, se conserva cuándo se cerró.
      completedAt: doneChanged ? derived.completedAt : parent.completedAt,
      ...(position !== undefined ? { position } : {}),
    },
  });
}

/// Después de tocar columnas (agregar, reordenar, borrar) las hijas pueden
/// haberse reabierto o cerrado por la invariante: se vuelven a derivar todos
/// los contenedores del tablero.
export async function syncBoardContainers(tx: Prisma.TransactionClient, boardId: string): Promise<void> {
  // leaf-ok: busca justamente a los contenedores (lo contrario del filtro), para re-derivarlos.
  const containers = await tx.card.findMany({ where: { column: { boardId }, children: { some: {} } }, select: { id: true } });
  for (const { id } of containers) await syncContainer(tx, id);
}
