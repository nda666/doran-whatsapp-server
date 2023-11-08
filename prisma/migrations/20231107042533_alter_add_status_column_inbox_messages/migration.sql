-- AlterTable
ALTER TABLE `inbox_messages` ADD COLUMN `status` INTEGER NULL,
    MODIFY `quote` TEXT NULL;
