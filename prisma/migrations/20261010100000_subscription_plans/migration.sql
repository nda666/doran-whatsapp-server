CREATE TABLE `subscription_plans` (
  `id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `deviceLimit` INTEGER NOT NULL DEFAULT 100,
  `description` VARCHAR(500) NOT NULL DEFAULT '',
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `subscription_plans_name_key` (`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `subscription_plans` (`id`, `name`, `deviceLimit`, `updatedAt`)
SELECT UUID(), `plan`, MAX(`deviceLimit`), CURRENT_TIMESTAMP(3) FROM `users` GROUP BY `plan`;
INSERT IGNORE INTO `subscription_plans` (`id`, `name`, `deviceLimit`, `updatedAt`)
VALUES (UUID(), 'Standard', 100, CURRENT_TIMESTAMP(3));

ALTER TABLE `media_assets` ADD COLUMN `originalName` VARCHAR(255) NULL;
ALTER TABLE `campaigns` ADD COLUMN `audience` JSON NULL;
