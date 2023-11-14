/*
  Warnings:

  - The primary key for the `groups` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `groups` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - You are about to drop the `groups_on_participants` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `group_id` to the `groups` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `groups_on_participants` DROP FOREIGN KEY `groups_on_participants_groupId_fkey`;

-- DropForeignKey
ALTER TABLE `groups_on_participants` DROP FOREIGN KEY `groups_on_participants_participantId_fkey`;

-- AlterTable
ALTER TABLE `groups` DROP PRIMARY KEY,
    ADD COLUMN `group_id` VARCHAR(191) NOT NULL,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- DropTable
DROP TABLE `groups_on_participants`;

-- CreateTable
CREATE TABLE `_GroupToParticipant` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_GroupToParticipant_AB_unique`(`A`, `B`),
    INDEX `_GroupToParticipant_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `_GroupToParticipant` ADD CONSTRAINT `_GroupToParticipant_A_fkey` FOREIGN KEY (`A`) REFERENCES `groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_GroupToParticipant` ADD CONSTRAINT `_GroupToParticipant_B_fkey` FOREIGN KEY (`B`) REFERENCES `participants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
