-- AlterTable: subtareas. `parentId` es null en todo lo existente: toda tarjeta de
-- hoy es una hoja, así que ninguna métrica cambia con esta migración.
ALTER TABLE "Card" ADD COLUMN "parentId" TEXT;

-- CreateIndex
CREATE INDEX "Card_parentId_idx" ON "Card"("parentId");

-- AddForeignKey: SetNull — si un contenedor desaparece, sus hijas siguen existiendo.
ALTER TABLE "Card" ADD CONSTRAINT "Card_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;
