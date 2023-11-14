/*
  Warnings:

  - The primary key for the `groupsonparticipants` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `participantId` on the `groupsonparticipants` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - The primary key for the `participants` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `participants` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.

*/
-- DropForeignKey
ALTER TABLE `groupsonparticipants` DROP FOREIGN KEY `GroupsOnParticipants_participantId_fkey`;

-- AlterTable
ALTER TABLE `groupsonparticipants` DROP PRIMARY KEY,
    MODIFY `participantId` INTEGER NOT NULL,
    ADD PRIMARY KEY (`participantId`, `groupId`);

-- AlterTable
ALTER TABLE `participants` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AddForeignKey
ALTER TABLE `GroupsOnParticipants` ADD CONSTRAINT `GroupsOnParticipants_participantId_fkey` FOREIGN KEY (`participantId`) REFERENCES `participants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
