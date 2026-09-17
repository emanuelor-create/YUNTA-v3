# Yunta — lo que el backend tiene que soportar

Documento para el trabajo de **backend** (NestJS + Prisma + Postgres/Supabase).
No describe UI: describe el modelo de datos y los endpoints que las pantallas
diseñadas necesitan para funcionar con datos reales.

Los diseños son la especificación funcional. Cuando este documento y una pantalla
digan cosas distintas, gana la pantalla — pero avisá, porque probablemente sea un
error del documento.

---

## 1. Decisión de modelo: el estado de una tarjeta ES su columna

Esto es lo más importante del documento y lo más fácil de implementar mal.

**No agregues un campo `status` a `Card`.** Una tarjeta no tiene estado propio: el
estado es la columna del tablero en la que vive. Las consecuencias:

- Las opciones del selector de estado se leen de `Board.columns`, ordenadas por
  `position`. No hay enum de estados en el backend.
- **Agregar una columna agrega un estado.** Si el usuario crea "Bloqueado", eso
  aparece como estado disponible en todas las tarjetas de ese tablero, sin
  migración ni deploy.
- Cambiar el estado desde el modal de detalle **es la mutación de mover tarjeta**
  (`PATCH /cards/:id/move`), la misma que usa el drag & drop del tablero. Un solo
  camino, no dos.
- "Hecho" es **la última columna por `position`**, no un nombre reservado. Si se
  agrega una columna al final, esa pasa a ser el cierre.
- Al eliminar una columna, sus tarjetas deben reasignarse a la primera columna
  (nunca quedar con `columnId` colgado).

```prisma
model Column {
  id       String @id @default(cuid())
  boardId  String
  name     String
  position Int
  cards    Card[]
  @@unique([boardId, position])
}
```

## 2. Campos nuevos en `Card`

```prisma
model Card {
  // … lo que ya existe

  /// Escala de esfuerzo del equipo. Valores permitidos: 1,2,3,5,8,13.
  storyPoints  Int?

  /// Etapa de avance. Valores permitidos: 0,25,50,75,100.
  progress     Int  @default(0)

  /// Se setea cuando la tarjeta llega a la última columna o a progress=100.
  completedAt  DateTime?
}
```

### `storyPoints` — validación

Solo la secuencia **1, 2, 3, 5, 8, 13**. Rechazá cualquier otro valor (400): no
es un número libre, es una escala. La tabla de significados vive en el front
(está en el modal de detalle); el backend solo valida el conjunto.

El 13 tiene semántica propia: significa "debería dividirse". No lo bloquees —
el equipo puede dejarlo y justificar — pero conviene poder contarlas:
`WHERE storyPoints = 13 AND completedAt IS NULL` es la consulta de "tarjetas a
dividir" del informe de proyecto.

### `progress` — validación e invariante

Solo **0, 25, 50, 75, 100**. Cada valor tiene un significado definido por el
equipo (no iniciado / solución definida / desarrollo principal / en pruebas /
validado), así que no es un porcentaje libre: es una enumeración que se muestra
como porcentaje.

**Invariante que el backend debe garantizar** (el front ya lo hace, pero la API
es la que tiene que ser consistente):

| Cambio | Efecto obligatorio |
| --- | --- |
| `progress = 100` | mover a la última columna + setear `completedAt` |
| tarjeta movida a la última columna | `progress = 100` + `completedAt` |
| `progress` baja de 100 | sacar de la última columna (a la penúltima) + `completedAt = null` |
| tarjeta sacada de la última columna | si `progress = 100`, bajarlo a 75 |

Sin esto quedan tarjetas al 100% abiertas en el tablero, o en "Hecho" con el
avance al 50% — dos verdades para el mismo hecho.

## 3. Endpoints que faltan

Los diseños ya muestran estos datos. Ordenados por lo que desbloquean.

### 3.1 Estadísticas de proyecto (pestaña Informe / card Avance)

```
GET /projects/:id/stats?window=7d
```

```ts
{
  // desglose por columna, en orden de position
  byColumn:   { columnId: string; name: string; count: number }[],
  // distribución por etapa de avance — las 5 claves siempre presentes, incluso en 0
  byProgress: { 0: number; 25: number; 50: number; 75: number; 100: number },
  points: {
    total:     number,   // SUM(storyPoints) de todas las tarjetas
    completed: number,   // SUM(storyPoints) WHERE completedAt IS NOT NULL
    avg:       number,   // AVG(storyPoints) — tamaño promedio de tarjeta
    toSplit:   number,   // COUNT WHERE storyPoints = 13 AND completedAt IS NULL
  },
  window: {              // la ventana pedida (7d por defecto)
    completed: number,   // tarjetas cerradas en el período
    updated:   number,
    created:   number,
    dueSoon:   number,   // vencen en los próximos 7 días, sin cerrar
  },
}
```

Dos reglas de coherencia que el diseño asume:

- `points.completed / points.total` no puede contradecir el % de tarjetas
  completadas. Si difieren mucho, es real (cerraron las chicas) y está bien —
  pero tiene que salir del mismo conteo, no de dos consultas distintas.
- En un proyecto cerrado, `window` da todo en 0.

### 3.2 Métricas de equipo

```
GET /users/:id/metrics?window=30d
```

```ts
{
  pointsClosed:  number,   // velocidad: puntos cerrados en el período
  cardsClosed:   number,
  avgPoints:     number,   // tamaño promedio de lo que agarra
  openCards:     number,
  overdueCards:  number,
}
```

Esto es lo que habilita "medir al equipo" sin contar horas: **puntos cerrados por
período**, no tiempo. Es deliberado — se eliminó el registro de horas del diseño.

### 3.3 Administración de usuarios

```
PATCH  /users/:id                  { name?, email?, role?, isActive? }
POST   /users/:id/reset-password    → envía enlace por correo
PUT    /users/:id/password          { password }  (mínimo 8 caracteres)
DELETE /users/:id                   → soft delete
GET    /users?page&pageSize&q&role&status
```

El listado necesita, por usuario: `projectCount`, `openCount`, `overdueCount`,
`lastActiveAt`. Hoy `StaffUser` no los trae y la grilla no se puede armar.

### 3.4 Tres estados de usuario, no un booleano

`isActive: boolean` no alcanza. La grilla muestra **Activo / Pendiente /
Inactivo**, donde "Pendiente" es invitación enviada y no aceptada:

```prisma
enum UserStatus { ACTIVE PENDING INACTIVE }
```

### 3.5 Miembros de proyecto por email

`POST /projects/:id/members` hoy recibe `userId`. El diseño invita **por email**
a alguien que puede no existir todavía: si no hay usuario con ese correo, hay que
crearlo en `PENDING` y mandar la invitación.

```
POST /projects/:id/members  { email, role: 'OWNER'|'EDITOR'|'VIEWER' }
```

### 3.6 Columnas del tablero

```
POST   /boards/:id/columns          { name }              → agrega al final
PATCH  /boards/:id/columns/:colId   { name?, position? }
DELETE /boards/:id/columns/:colId   → reasigna sus tarjetas a la primera
```

Consecuencia de la sección 1: esto es también el CRUD de estados.

## 4. Migración

Los tres campos nuevos son opcionales o tienen default, así que la migración no
rompe datos existentes:

```sql
ALTER TABLE "Card" ADD COLUMN "storyPoints" INTEGER;
ALTER TABLE "Card" ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Card" ADD COLUMN "completedAt" TIMESTAMP;

-- Backfill: las tarjetas que ya están en la última columna quedan al 100%.
UPDATE "Card" c SET "progress" = 100, "completedAt" = c."updatedAt"
WHERE c."columnId" IN (
  SELECT DISTINCT ON ("boardId") id FROM "Column" ORDER BY "boardId", "position" DESC
);
```

`storyPoints` queda en NULL para todo lo viejo: es correcto, nadie las estimó.
Las consultas de puntos deben tratar NULL como "sin estimar" y **excluirlas del
promedio**, no contarlas como 0.

## 5. Lo que NO hay que construir

- **Registro de horas.** Se sacó del diseño a propósito. No hay `TimeEntry`, ni
  cronómetro, ni horas estimadas vs. reales. La medición es por puntos y etapa.
- **Campo `status` en `Card`.** Ver sección 1.
- **Enum de estados de tarjeta.** Las columnas son la lista.
- **Estados "En revisión" / "En riesgo" en `ProjectStatus`.** Se derivan en el
  front a partir de fechas y avance; no hacen falta en la base.

---

## Cómo arrancar en Claude Code

1. Conectá el repo nuevo y pedile que lea `design_handoff_yunta_ui/BACKEND.md`
   completo antes de escribir código.
2. Primer paso, solo el modelo:
   > Leé `design_handoff_yunta_ui/BACKEND.md`. Implementá la sección 2 (campos
   > nuevos en Card) y la sección 4 (migración con backfill). Respetá las
   > validaciones de la escala: storyPoints solo 1,2,3,5,8,13 y progress solo
   > 0,25,50,75,100. No implementes endpoints todavía.
3. Después la invariante, que es la parte delicada:
   > Implementá la tabla de invariantes de la sección 2 en el servicio de cards,
   > de modo que valga tanto al mover una tarjeta como al cambiar su progress.
   > Agregá tests para los cuatro casos de la tabla.
4. Recién ahí los endpoints, uno por conversación, empezando por
   `GET /projects/:id/stats` (sección 3.1), que es el que desbloquea el informe.
