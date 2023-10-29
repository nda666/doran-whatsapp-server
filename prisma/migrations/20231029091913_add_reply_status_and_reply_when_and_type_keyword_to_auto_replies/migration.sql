-- AlterTable
ALTER TABLE `auto_replies` ADD COLUMN `is_quoted` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `reply_status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    ADD COLUMN `reply_when` ENUM('Group', 'Personal', 'All') NOT NULL DEFAULT 'All',
    ADD COLUMN `type_keyword` ENUM('Equal', 'Contain') NOT NULL DEFAULT 'Equal';
