-- DropForeignKey
ALTER TABLE `auto_replies` DROP FOREIGN KEY `auto_replies_phoneId_fkey`;

-- DropForeignKey
ALTER TABLE `auto_replies` DROP FOREIGN KEY `auto_replies_userId_fkey`;

-- AlterTable
ALTER TABLE `inbox_messages` ADD COLUMN `quote` JSON NULL,
    MODIFY `is_sent` BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE `auto_replies` ADD CONSTRAINT `auto_replies_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auto_replies` ADD CONSTRAINT `auto_replies_phoneId_fkey` FOREIGN KEY (`phoneId`) REFERENCES `phones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
