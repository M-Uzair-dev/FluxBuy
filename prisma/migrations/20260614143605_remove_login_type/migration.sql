/*
  Warnings:

  - You are about to drop the column `loginType` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "loginType";

-- DropEnum
DROP TYPE "loginType";
