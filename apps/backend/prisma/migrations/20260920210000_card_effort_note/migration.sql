-- AlterTable: justificación de "dejar en 13" (BACKEND.md §2: "el equipo puede dejarlo y
-- justificar"). Nullable: solo tiene sentido con storyPoints = 13 y se limpia al cambiar
-- de valor. No hay comentarios todavía, así que la justificación vive en la tarjeta.
ALTER TABLE "Card" ADD COLUMN "effortNote" TEXT;
