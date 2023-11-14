/*
  Warnings:

  - You are about to drop the column `is_send_group` on the `phones` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `phones` DROP COLUMN `is_send_group`,
    ADD COLUMN `is_save_group` BOOLEAN NOT NULL DEFAULT false;
