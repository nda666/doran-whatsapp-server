/*
  Warnings:

  - Added the required column `whatsapp_id` to the `participants` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `participants` ADD COLUMN `whatsapp_id` VARCHAR(191) NOT NULL;
