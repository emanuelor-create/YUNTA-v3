-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'CARD_PRIORITY_CHANGED';

-- CreateEnum
CREATE TYPE "CardPriority" AS ENUM ('ALTA', 'MEDIA', 'BAJA');

-- AlterTable: nullable y sin default — "sin clasificar" es un estado legítimo.
ALTER TABLE "Card" ADD COLUMN "priority" "CardPriority";

-- CreateTable
CREATE TABLE "ProjectDailySnapshot" (
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "openCards" INTEGER NOT NULL,
    "completedCards" INTEGER NOT NULL,
    "totalPoints" INTEGER NOT NULL,
    "completedPoints" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectDailySnapshot_pkey" PRIMARY KEY ("projectId","date")
);

-- CreateTable
CREATE TABLE "UserDailySnapshot" (
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "assigned" INTEGER NOT NULL,
    "overdue" INTEGER NOT NULL,
    "dueSoon" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDailySnapshot_pkey" PRIMARY KEY ("userId","date")
);

-- AddForeignKey
ALTER TABLE "ProjectDailySnapshot" ADD CONSTRAINT "ProjectDailySnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDailySnapshot" ADD CONSTRAINT "UserDailySnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
