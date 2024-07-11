-- AlterTable
ALTER TABLE `auto_replies` MODIFY `type` ENUM('text', 'image', 'button', 'template', 'list', 'webhook') NOT NULL DEFAULT 'text';
