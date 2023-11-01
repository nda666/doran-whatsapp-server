/*
  Warnings:

  - You are about to drop the column `isRead` on the `inbox_messages` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `inbox_messages` DROP COLUMN `isRead`,
    ADD COLUMN `is_read` BOOLEAN NOT NULL DEFAULT true;
