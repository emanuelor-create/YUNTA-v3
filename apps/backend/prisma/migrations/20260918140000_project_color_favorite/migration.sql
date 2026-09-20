-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "color" TEXT NOT NULL DEFAULT '#1b1917';

-- AlterTable
ALTER TABLE "ProjectMember" ADD COLUMN     "isFavorite" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: reparte los proyectos ya existentes entre los 5 colores de
-- marca (AVATAR_PALETTE en components/Avatar.tsx), determinístico por id
-- — mismo criterio que colorFor() del front. Nadie usa POST /projects
-- todavía, así que no hay "asignado al crear" real hasta que exista.
UPDATE "Project"
SET "color" = CASE ((('x' || substr(md5(id), 1, 8))::bit(32)::int % 5 + 5) % 5)
  WHEN 0 THEN '#1b1917'
  WHEN 1 THEN '#b4552f'
  WHEN 2 THEN '#8a5a2b'
  WHEN 3 THEN '#5c564d'
  WHEN 4 THEN '#8a8378'
END;

