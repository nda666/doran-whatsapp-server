/*
  Warnings:

  - You are about to drop the `groupsonphones` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `groupsonphones` DROP FOREIGN KEY `GroupsOnPhones_groupId_fkey`;

-- DropForeignKey
ALTER TABLE `groupsonphones` DROP FOREIGN KEY `GroupsOnPhones_phoneId_fkey`;

-- DropTable
DROP TABLE `groupsonphones`;

-- CreateTable
CREATE TABLE `participants` (
    `id` VARCHAR(191) NOT NULL,
    `admin` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GroupsOnParticipants` (
    `participantId` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`participantId`, `groupId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GroupsOnParticipants` ADD CONSTRAINT `GroupsOnParticipants_participantId_fkey` FOREIGN KEY (`participantId`) REFERENCES `participants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GroupsOnParticipants` ADD CONSTRAINT `GroupsOnParticipants_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
