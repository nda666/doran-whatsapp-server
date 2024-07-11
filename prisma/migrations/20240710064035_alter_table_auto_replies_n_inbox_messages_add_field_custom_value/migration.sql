-- AlterTable
ALTER TABLE `auto_replies` ADD COLUMN `custom_value_1` VARCHAR(191) NULL,
    ADD COLUMN `custom_value_2` VARCHAR(191) NULL,
    ADD COLUMN `custom_value_3` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `inbox_messages` ADD COLUMN `custom_value_1` VARCHAR(191) NULL,
    ADD COLUMN `custom_value_2` VARCHAR(191) NULL,
    ADD COLUMN `custom_value_3` VARCHAR(191) NULL;
