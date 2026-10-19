-- Existing users retain access; public signup explicitly creates PENDING users.
ALTER TABLE `users` ADD COLUMN `approvalStatus` VARCHAR(16) NOT NULL DEFAULT 'APPROVED';
