/*
 Warnings:
 
 - You are about to drop the `groupsonparticipants` table. If the table is not empty, all the data it contains will be lost.
 
 */
-- DropForeignKey
ALTER TABLE
  `GroupsOnParticipants` DROP FOREIGN KEY `GroupsOnParticipants_groupId_fkey`;

-- DropForeignKey
ALTER TABLE
  `GroupsOnParticipants` DROP FOREIGN KEY `GroupsOnParticipants_participantId_fkey`;

-- DropTable
DROP TABLE `GroupsOnParticipants`;

-- CreateTable
CREATE TABLE `groups_on_participants` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `participantId` INTEGER NOT NULL,
  `groupId` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE
  `groups_on_participants`
ADD
  CONSTRAINT `groups_on_participants_participantId_fkey` FOREIGN KEY (`participantId`) REFERENCES `participants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
  `groups_on_participants`
ADD
  CONSTRAINT `groups_on_participants_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;