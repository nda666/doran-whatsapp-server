-- AlterTable
ALTER TABLE `auto_replies` MODIFY `type_keyword` ENUM('Equal', 'Contain', 'Any') NOT NULL DEFAULT 'Equal';
