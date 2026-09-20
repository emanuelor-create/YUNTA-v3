/// Datos de demostración para ver las pantallas con contenido: `npm run seed`
/// (en apps/backend). Pensado para encontrar lo que se rompe con datos reales
/// — nombres largos, una barra al 0%, un proyecto todo cerrado, vencidas.
///
/// Idempotente: todo lo que crea lleva el prefijo `seed-` en el id. Cada corrida
/// borra los proyectos `seed-proj-*` (por cascada: tablero, columnas, tarjetas,
/// asignaciones, miembros y actividad) y los vuelve a crear con fechas
/// relativas a hoy, así que dos corridas dejan el mismo estado. Nunca toca
/// datos que no sean del seed. Las ediciones hechas desde la UI a estos
/// proyectos se pierden al re-correrlo.
///
/// Los usuarios `seed-user-*` existen solo como perfiles (no tienen cuenta en
/// Supabase Auth): sirven para asignaciones y equipos, no para iniciar sesión.
/// Vos (SEED_ADMIN_EMAIL, por defecto emanuel.or@gmail.com) entrás como
/// miembro de los proyectos, con distinto rol en cada uno.
import 'dotenv/config';
import { CardPriority, PrismaClient, ProjectRole, UserRole, UserStatus } from '@prisma/client';
import { deriveProjectKey, firstFreeKey } from '../src/projects/project-key';

if (process.env.NODE_ENV === 'production') {
  console.error('El seed no corre con NODE_ENV=production.');
  process.exit(1);
}

const prisma = new PrismaClient();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.now();

const ago = (days: number, hours = 0) => new Date(NOW - days * DAY - hours * HOUR);
/// Fecha local a las hh:mm, `days` días desde hoy (negativo = pasado).
function at(days: number, hour = 12, minute = 0): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}
const allDay = (days: number) => at(days, 0, 0);

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmt = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

// ── Usuarios ───────────────────────────────────────────────────────────────

const SEED_USERS = [
  { key: 'ana', name: 'Ana García', role: UserRole.PM, status: UserStatus.ACTIVE },
  { key: 'bruno', name: 'Bruno Martínez', role: UserRole.DEVELOPER, status: UserStatus.ACTIVE },
  { key: 'carla', name: 'Carla Fernández-Rodríguez de la Vega', role: UserRole.DEVELOPER, status: UserStatus.ACTIVE },
  { key: 'diego', name: 'Diego Sosa', role: UserRole.DEVELOPER, status: UserStatus.ACTIVE },
  { key: 'elena', name: 'Elena Ruiz', role: UserRole.PM, status: UserStatus.PENDING },
  { key: 'fede', name: 'Federico Álvarez', role: UserRole.DEVELOPER, status: UserStatus.INACTIVE },
] as const;

const seedUserId = (key: string) => `seed-user-${key}`;

// ── Tarjetas ───────────────────────────────────────────────────────────────

interface CardSpec {
  title: string;
  /// Índice de columna. La última es "hecho": progress 100 y completedAt.
  col: number;
  progress: 0 | 25 | 50 | 75 | 100;
  sp: 1 | 2 | 3 | 5 | 8 | 13 | null;
  due?: Date;
  who?: string[]; // 'me' | clave de SEED_USERS
  /// Explícita solo donde importa (Tu día); el resto sale del ciclo de abajo.
  /// `null` = sin clasificar.
  pri?: CardPriority | null;
  created: number; // hace N días
  done?: Date; // obligatorio si col es la última
}

interface ProjectSpec {
  key: string;
  name: string;
  client: string;
  color: string;
  start: Date | null;
  end: Date | null;
  archived?: boolean;
  description?: string;
  columns: string[];
  members: { who: string; role: ProjectRole; favorite?: boolean }[];
  cards: CardSpec[];
  activity: { who: string; type: string; message: string; card?: string; hoursAgo: number }[];
}

const PROJECTS: ProjectSpec[] = [
  {
    key: 'web',
    name: 'Rediseño del sitio web corporativo',
    client: 'Acme Corp',
    color: '#b4552f',
    description: 'Nuevo sitio institucional con CMS headless, sistema de diseño propio y foco en accesibilidad.',
    start: at(-40),
    end: at(20),
    columns: ['Por hacer', 'En curso', 'En revisión', 'Hecho'],
    members: [
      { who: 'me', role: ProjectRole.OWNER, favorite: true },
      { who: 'ana', role: ProjectRole.EDITOR },
      { who: 'bruno', role: ProjectRole.EDITOR },
      { who: 'carla', role: ProjectRole.EDITOR },
      { who: 'diego', role: ProjectRole.VIEWER },
    ],
    cards: [
      { title: 'Auditoría de contenido y arquitectura de información', col: 3, progress: 100, sp: 5, created: 38, done: ago(30), who: ['ana'] },
      { title: 'Definir sistema de diseño y tokens', col: 3, progress: 100, sp: 8, created: 36, done: ago(9), who: ['carla', 'ana'] },
      { title: 'Maquetar home responsive', col: 3, progress: 100, sp: 8, created: 30, done: ago(3), who: ['bruno'] },
      { title: 'Formulario de contacto con validación', col: 3, progress: 100, sp: 3, due: at(0, 15), created: 20, done: ago(0, 2), who: ['me'], pri: 'MEDIA' },
      { title: 'Configurar analítica y consentimiento de cookies', col: 3, progress: 100, sp: 2, created: 25, done: ago(5), who: ['bruno'] },
      { title: 'Revisión de accesibilidad WCAG AA en todas las plantillas del sitio y del blog corporativo', col: 2, progress: 75, sp: 5, due: at(2, 11), created: 18, who: ['carla'] },
      { title: 'Optimizar imágenes y carga diferida', col: 2, progress: 75, sp: 3, due: at(5, 16), created: 15, who: ['bruno'] },
      { title: 'Página de casos de éxito', col: 1, progress: 50, sp: 8, due: at(3, 10), created: 14, who: ['me', 'ana'] },
      { title: 'Integrar CMS headless', col: 1, progress: 50, sp: 13, due: at(9, 18), created: 22, who: ['bruno'] },
      { title: 'Buscador interno con sugerencias', col: 1, progress: 25, sp: 13, due: at(15), created: 12, who: ['carla'] },
      { title: 'Migrar el blog existente', col: 1, progress: 25, sp: 5, due: at(-3, 18), created: 21, who: ['me'] },
      { title: 'Textos legales y política de privacidad', col: 0, progress: 0, sp: 1, due: at(0, 10), created: 9, who: ['me'], pri: 'ALTA' },
      { title: 'Traducciones al inglés', col: 0, progress: 0, sp: null, created: 7, who: [] },
      { title: 'Página de contacto: mapa y sucursales', col: 0, progress: 25, sp: 2, due: at(0, 17, 30), created: 8, who: ['me', 'carla'], pri: null },
      { title: 'Favicon y metadatos Open Graph', col: 0, progress: 0, sp: 1, due: at(1, 12), created: 6, who: ['ana'] },
      { title: 'Preparar el plan de lanzamiento y comunicación', col: 0, progress: 0, sp: 3, due: at(6, 9), created: 5, who: ['ana'] },
      { title: 'Pruebas cross-browser', col: 0, progress: 0, sp: 5, due: at(4, 14), created: 4, who: [] },
    ],
    activity: [
      { who: 'carla', type: 'CARD_PROGRESS_CHANGED', message: 'cambió el avance a 75%', card: 'Revisión de accesibilidad WCAG AA en todas las plantillas del sitio y del blog corporativo', hoursAgo: 1 },
      { who: 'me', type: 'CARD_MOVED', message: 'movió la tarjeta a "Hecho"', card: 'Formulario de contacto con validación', hoursAgo: 2 },
      { who: 'ana', type: 'CARD_ASSIGNED', message: 'asignó la tarjeta a Bruno Martínez', card: 'Optimizar imágenes y carga diferida', hoursAgo: 5 },
      { who: 'bruno', type: 'CARD_MOVED', message: 'movió la tarjeta a "En revisión"', card: 'Optimizar imágenes y carga diferida', hoursAgo: 26 },
      { who: 'ana', type: 'MEMBER_ADDED', message: 'invitó a diego@yunta.seed como VIEWER', hoursAgo: 48 },
      { who: 'me', type: 'PROJECT_UPDATED', message: `cambió la fecha de entrega de ${fmt(at(12))} a ${fmt(at(20))}`, hoursAgo: 72 },
      { who: 'carla', type: 'COLUMN_CREATED', message: 'creó la columna "En revisión"', hoursAgo: 120 },
    ],
  },
  {
    key: 'app',
    name: 'App móvil de pedidos',
    client: 'Restaurantes del Sur',
    color: '#1b1917',
    description: 'Aplicación para pedir y seguir entregas. Entrega comprometida vencida: en riesgo.',
    start: at(-70),
    end: at(-6),
    columns: ['Backlog', 'En progreso', 'Hecho'],
    members: [
      { who: 'ana', role: ProjectRole.OWNER },
      { who: 'me', role: ProjectRole.EDITOR, favorite: true },
      { who: 'diego', role: ProjectRole.EDITOR },
      { who: 'elena', role: ProjectRole.EDITOR },
    ],
    cards: [
      { title: 'Pantalla de login y registro', col: 2, progress: 100, sp: 5, created: 65, done: ago(40), who: ['diego'] },
      { title: 'Catálogo de productos con filtros', col: 2, progress: 100, sp: 8, created: 60, done: ago(25), who: ['elena'] },
      { title: 'Carrito y checkout', col: 2, progress: 100, sp: 13, created: 55, done: ago(12), who: ['diego', 'elena'] },
      { title: 'Corregir el cierre inesperado al iniciar', col: 2, progress: 100, sp: 1, created: 3, done: ago(0, 4), who: ['me'] },
      { title: 'Integración con la pasarela de pagos', col: 1, progress: 75, sp: 8, due: at(-6, 12), created: 40, who: ['diego', 'me'] },
      { title: 'Notificaciones push', col: 1, progress: 50, sp: 5, due: at(-2, 12), created: 30, who: ['elena'] },
      { title: 'Seguimiento del pedido en tiempo real', col: 1, progress: 50, sp: 13, due: at(-1, 12), created: 28, who: ['ana', 'diego'] },
      { title: 'Modo sin conexión', col: 1, progress: 25, sp: 8, due: at(2, 13), created: 20, who: ['me'] },
      { title: 'Historial de pedidos', col: 1, progress: 25, sp: 3, due: at(4, 10), created: 18, who: ['elena'] },
      { title: 'Pantalla de perfil', col: 0, progress: 0, sp: 2, due: at(6, 12), created: 14, who: [] },
      { title: 'Cupones y promociones', col: 0, progress: 0, sp: 5, due: at(10), created: 10, who: ['ana'] },
      { title: 'Soporte para tablets', col: 0, progress: 0, sp: null, created: 8, who: [] },
      { title: 'Publicar en las tiendas de aplicaciones', col: 0, progress: 0, sp: 3, due: at(-4, 12), created: 12, who: ['ana'] },
    ],
    activity: [
      { who: 'me', type: 'CARD_MOVED', message: 'movió la tarjeta a "Hecho"', card: 'Corregir el cierre inesperado al iniciar', hoursAgo: 4 },
      { who: 'diego', type: 'CARD_PROGRESS_CHANGED', message: 'cambió el avance a 75%', card: 'Integración con la pasarela de pagos', hoursAgo: 30 },
      { who: 'ana', type: 'MEMBER_ROLE_CHANGED', message: 'cambió el rol de Elena Ruiz a EDITOR', hoursAgo: 96 },
    ],
  },
  {
    key: 'cloud',
    name: 'Migración de la infraestructura de datos a la nube y plataforma de analítica avanzada para clientes enterprise',
    client: 'Globex International Holdings Corporation',
    color: '#8a5a2b',
    description: null as unknown as string,
    start: at(10),
    end: at(120),
    columns: ['Ideas y solicitudes pendientes de priorizar', 'En análisis', 'Completado'],
    members: [
      { who: 'elena', role: ProjectRole.OWNER },
      { who: 'me', role: ProjectRole.VIEWER },
      { who: 'fede', role: ProjectRole.EDITOR },
    ],
    cards: [
      { title: 'Inventario de fuentes de datos y dependencias entre sistemas heredados', col: 0, progress: 0, sp: 8, due: at(30), created: 2, who: ['elena'] },
      { title: 'Definir la arquitectura de referencia', col: 0, progress: 0, sp: 13, due: at(45), created: 2, who: ['elena', 'fede'] },
      { title: 'Estimar costos de la migración', col: 0, progress: 0, sp: null, created: 1, who: [] },
      { title: 'Relevar requisitos de seguridad y cumplimiento', col: 0, progress: 0, sp: 5, due: at(60), created: 1, who: ['fede'] },
    ],
    activity: [{ who: 'elena', type: 'MEMBER_ADDED', message: 'invitó a fede@yunta.seed como EDITOR', hoursAgo: 20 }],
  },
  {
    key: 'portal',
    name: 'Portal de clientes v2',
    client: 'Initech',
    color: '#5c564d',
    description: 'Proyecto entregado. Todo cerrado.',
    start: at(-120),
    end: at(-15),
    columns: ['Por hacer', 'En curso', 'Hecho'],
    members: [
      { who: 'me', role: ProjectRole.OWNER },
      { who: 'bruno', role: ProjectRole.EDITOR },
      { who: 'carla', role: ProjectRole.EDITOR },
    ],
    cards: [
      { title: 'Autenticación con SSO', col: 2, progress: 100, sp: 8, created: 110, done: ago(45), who: ['bruno'] },
      { title: 'Panel de facturación', col: 2, progress: 100, sp: 5, created: 100, done: ago(38), who: ['carla'] },
      { title: 'Descarga de reportes en PDF', col: 2, progress: 100, sp: 3, created: 90, done: ago(30), who: ['bruno'] },
      { title: 'Gestión de usuarios y permisos', col: 2, progress: 100, sp: 13, created: 95, done: ago(24), who: ['me', 'carla'] },
      { title: 'Migración de datos históricos', col: 2, progress: 100, sp: 8, created: 80, done: ago(20), who: ['bruno'] },
      { title: 'Pruebas de aceptación con el cliente', col: 2, progress: 100, sp: 2, created: 60, done: ago(16), who: ['me'] },
    ],
    activity: [{ who: 'me', type: 'CARD_MOVED', message: 'movió la tarjeta a "Hecho"', card: 'Pruebas de aceptación con el cliente', hoursAgo: 16 * 24 }],
  },
  {
    key: 'campana',
    name: 'Campaña de lanzamiento Q3',
    client: 'Umbrella',
    color: '#8a8378',
    description: 'Campaña archivada.',
    start: at(-100),
    end: at(-40),
    archived: true,
    columns: ['Por hacer', 'En curso', 'Hecho'],
    members: [
      { who: 'me', role: ProjectRole.OWNER },
      { who: 'ana', role: ProjectRole.EDITOR },
    ],
    cards: [
      { title: 'Concepto creativo y mensajes clave', col: 2, progress: 100, sp: 5, created: 95, done: ago(70), who: ['ana'] },
      { title: 'Piezas para redes sociales', col: 2, progress: 100, sp: 3, created: 90, done: ago(55), who: ['ana'] },
      { title: 'Landing de la campaña', col: 1, progress: 50, sp: 8, created: 80, who: ['me'] },
      { title: 'Reporte final de resultados', col: 0, progress: 0, sp: 2, created: 70, who: [] },
    ],
    activity: [{ who: 'me', type: 'PROJECT_ARCHIVED', message: 'archivó el proyecto', hoursAgo: 30 * 24 }],
  },
];

// Prioridades repartidas a propósito, con sin clasificar y Baja (sin badge) de
// por medio: la UI tiene que verse bien con las cuatro situaciones.
const PRIORITY_CYCLE: (CardPriority | null)[] = ['ALTA', 'MEDIA', 'BAJA', null, 'MEDIA', null, 'ALTA', 'BAJA'];

// Sobrecarga deliberada: Ana pasa la capacidad (16) para poder ver el estado
// "excedida" de la carga del equipo, que con datos parejos nunca aparece.
const OVERLOADED = { who: 'ana', target: 18 };
(() => {
  const open = (project: ProjectSpec) => project.cards.filter((card) => card.col !== project.columns.length - 1);
  const active = PROJECTS.filter((project) => !project.archived);
  let count = active.flatMap(open).filter((card) => card.who?.includes(OVERLOADED.who)).length;
  for (const card of active.flatMap(open)) {
    if (count >= OVERLOADED.target) break;
    if (!card.who?.includes(OVERLOADED.who)) {
      card.who = [...(card.who ?? []), OVERLOADED.who];
      count += 1;
    }
  }
})();

// ── Ejecución ──────────────────────────────────────────────────────────────

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'emanuel.or@gmail.com';
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    throw new Error(`No existe el usuario ${adminEmail}. Creá la cuenta primero (o definí SEED_ADMIN_EMAIL).`);
  }
  const userId = (who: string) => (who === 'me' ? admin.id : seedUserId(who));

  // Validación del invariante antes de tocar la base: 100 ⇔ última columna ⇔ completedAt.
  for (const project of PROJECTS) {
    const last = project.columns.length - 1;
    for (const card of project.cards) {
      const inLast = card.col === last;
      if (inLast !== (card.progress === 100) || inLast !== !!card.done) {
        throw new Error(`Seed inválido — "${card.title}" (${project.key}) rompe progress/columna/completedAt.`);
      }
    }
  }

  await prisma.project.deleteMany({ where: { id: { startsWith: 'seed-proj-' } } });

  // Claves de los proyectos del seed (RED, APP…): la primera libre respecto de
  // los proyectos reales que ya existan, igual que al crear uno desde la UI.
  const takenKeys = new Set((await prisma.project.findMany({ select: { key: true } })).map((row) => row.key));
  const keyFor = new Map<string, string>();
  for (const project of PROJECTS) {
    const key = firstFreeKey(deriveProjectKey(project.name), takenKeys);
    takenKeys.add(key);
    keyFor.set(project.key, key);
  }

  for (const u of SEED_USERS) {
    const data = {
      email: `${u.key}@yunta.seed`,
      name: u.name,
      role: u.role,
      status: u.status,
      deletedAt: null,
    };
    await prisma.user.upsert({ where: { id: seedUserId(u.key) }, create: { id: seedUserId(u.key), ...data }, update: data });
  }

  let cardCount = 0;
  for (const project of PROJECTS) {
    const projectId = `seed-proj-${project.key}`;
    const boardId = `seed-board-${project.key}`;

    await prisma.project.create({
      data: {
        id: projectId,
        name: project.name,
        key: keyFor.get(project.key)!,
        nextCardNumber: project.cards.length + 1,
        client: project.client,
        description: project.description ?? null,
        color: project.color,
        startDate: project.start,
        endDate: project.end,
        archivedAt: project.archived ? ago(30) : null,
        createdAt: ago(130),
        board: {
          create: {
            id: boardId,
            columns: { create: project.columns.map((name, i) => ({ id: `seed-col-${project.key}-${i}`, name, position: i })) },
          },
        },
      },
    });

    await prisma.projectMember.createMany({
      data: project.members.map((m) => ({
        userId: userId(m.who),
        projectId,
        role: m.role,
        isFavorite: !!m.favorite,
      })),
    });

    const positionByColumn = new Map<number, number>();
    const cardRows = project.cards.map((card, i) => {
      const position = positionByColumn.get(card.col) ?? 0;
      positionByColumn.set(card.col, position + 1);
      const created = ago(card.created);
      return {
        id: `seed-card-${project.key}-${i + 1}`,
        columnId: `seed-col-${project.key}-${card.col}`,
        title: card.title,
        number: i + 1,
        position,
        dueDate: card.due ?? null,
        storyPoints: card.sp,
        progress: card.progress,
        completedAt: card.done ?? null,
        priority: card.pri !== undefined ? card.pri : PRIORITY_CYCLE[i % PRIORITY_CYCLE.length],
        createdAt: created,
        // Las abiertas con avance se tocaron hace poco; las cerradas, al cerrarse.
        updatedAt: card.done ?? (card.progress > 0 ? ago(Math.min(card.created, 1 + (i % 6))) : created),
      };
    });
    await prisma.card.createMany({ data: cardRows });
    cardCount += cardRows.length;

    await prisma.cardAssignee.createMany({
      data: project.cards.flatMap((card, i) =>
        (card.who ?? []).map((who) => ({ cardId: `seed-card-${project.key}-${i + 1}`, userId: userId(who), createdAt: ago(card.created) })),
      ),
    });

    await prisma.activityLog.createMany({
      data: project.activity.map((a) => ({
        projectId,
        userId: userId(a.who),
        type: a.type as never,
        message: a.message,
        cardTitle: a.card ?? null,
        createdAt: ago(0, a.hoursAgo),
      })),
    });
  }

  // Comentarios de demostración en una tarjeta con conversación (uno editado,
  // uno tuyo). Se borran con el proyecto, por cascada.
  await prisma.comment.createMany({
    data: [
      { id: 'seed-comment-1', cardId: 'seed-card-web-6', authorId: seedUserId('carla'), text: 'Terminé el relevamiento de las plantillas. Falta revisar el blog.', createdAt: ago(0, 30) },
      { id: 'seed-comment-2', cardId: 'seed-card-web-6', authorId: seedUserId('ana'), text: 'Buenísimo. ¿Podés priorizar el formulario de contacto?\nEs lo que más tráfico tiene.', createdAt: ago(0, 8), editedAt: ago(0, 7) },
      { id: 'seed-comment-3', cardId: 'seed-card-web-6', authorId: admin.id, text: 'Lo dejo en revisión hasta que esté el formulario.', createdAt: ago(0, 1) },
    ],
  });

  console.log(
    `Seed listo: ${PROJECTS.length} proyectos, ${cardCount} tarjetas, ${SEED_USERS.length} usuarios ficticios. Vos (${adminEmail}) sos miembro de ${PROJECTS.length}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
