ALTER TABLE `phones` ADD COLUMN `assignedUserId` VARCHAR(191) NULL;
CREATE INDEX `phones_assignedUserId_idx` ON `phones` (`assignedUserId`);
