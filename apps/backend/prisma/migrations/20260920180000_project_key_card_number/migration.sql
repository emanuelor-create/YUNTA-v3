-- AlterEnum: crear proyecto, crear tarjeta y editar título/descripción quedan en Actividad.
ALTER TYPE "ActivityType" ADD VALUE 'PROJECT_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'CARD_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'CARD_UPDATED';

-- Project.key: prefijo del código de tarjeta. Se agrega nullable, se rellena y recién ahí NOT NULL.
ALTER TABLE "Project" ADD COLUMN "key" TEXT;
ALTER TABLE "Project" ADD COLUMN "nextCardNumber" INTEGER NOT NULL DEFAULT 1;

-- Backfill: primeras 3 letras del nombre (sin acentos, solo letras), mayúsculas. Si dos
-- proyectos comparten prefijo, el más viejo se queda con el limpio y los demás llevan un
-- número (APP, APP2, ...). Misma regla que deriveProjectKey() en el backend.
WITH base AS (
  SELECT id, "createdAt",
         COALESCE(
           NULLIF(UPPER(SUBSTRING(REGEXP_REPLACE(TRANSLATE("name", 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '[^A-Za-z]', '', 'g') FROM 1 FOR 3)), ''),
           'PRJ'
         ) AS prefix
  FROM "Project"
), ranked AS (
  SELECT id, prefix, ROW_NUMBER() OVER (PARTITION BY prefix ORDER BY "createdAt", id) AS rn FROM base
)
UPDATE "Project" p
SET "key" = CASE WHEN r.rn = 1 THEN r.prefix ELSE r.prefix || r.rn END
FROM ranked r
WHERE p.id = r.id;

ALTER TABLE "Project" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX "Project_key_key" ON "Project"("key");

-- Card.number: correlativo por proyecto, en orden de creación.
ALTER TABLE "Card" ADD COLUMN "number" INTEGER;

UPDATE "Card" c
SET "number" = n.rn
FROM (
  SELECT ca.id,
         ROW_NUMBER() OVER (PARTITION BY b."projectId" ORDER BY ca."createdAt", ca.id) AS rn
  FROM "Card" ca
  JOIN "Column" col ON col.id = ca."columnId"
  JOIN "Board" b ON b.id = col."boardId"
) n
WHERE c.id = n.id;

ALTER TABLE "Card" ALTER COLUMN "number" SET NOT NULL;

-- El contador de cada proyecto arranca después del último número usado.
UPDATE "Project" p
SET "nextCardNumber" = m.mx + 1
FROM (
  SELECT b."projectId" AS pid, MAX(ca."number") AS mx
  FROM "Card" ca
  JOIN "Column" col ON col.id = ca."columnId"
  JOIN "Board" b ON b.id = col."boardId"
  GROUP BY b."projectId"
) m
WHERE p.id = m.pid;
