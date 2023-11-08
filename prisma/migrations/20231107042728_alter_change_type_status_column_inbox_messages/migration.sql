/*
  Warnings:

  - You are about to alter the column `status` on the `inbox_messages` table. The data in that column could be lost. The data in that column will be cast from `Int` to `TinyInt`.

*/
-- AlterTable
ALTER TABLE `inbox_messages` MODIFY `status` BOOLEAN NULL;
