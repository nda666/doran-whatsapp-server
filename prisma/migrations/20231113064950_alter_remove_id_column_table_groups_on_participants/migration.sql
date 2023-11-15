/*
  Warnings:

  - The primary key for the `groups_on_participants` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `groups_on_participants` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `groups_on_participants` DROP PRIMARY KEY,
    DROP COLUMN `id`,
    ADD PRIMARY KEY (`participantId`, `groupId`);
