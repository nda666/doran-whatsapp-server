CREATE TABLE `global_settings` (
  `id` VARCHAR(36) NOT NULL,
  `label` VARCHAR(200) NOT NULL,
  `key` VARCHAR(120) NOT NULL,
  `value` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `global_settings_key_key` (`key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `password_reset_tokens` (
  `tokenHash` CHAR(64) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `email` VARCHAR(200) NOT NULL,
  `sessionVersion` INTEGER NOT NULL,
  `passwordHash` CHAR(64) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `password_reset_tokens_userId_idx` (`userId`),
  INDEX `password_reset_tokens_expiresAt_idx` (`expiresAt`),
  PRIMARY KEY (`tokenHash`),
  CONSTRAINT `password_reset_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `email_sequences` (
  `id` INTEGER NOT NULL,
  `attempts` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `auth_rate_limits` (
  `key` CHAR(64) NOT NULL,
  `count` INTEGER NOT NULL DEFAULT 0,
  `expiresAt` DATETIME(3) NOT NULL,
  INDEX `auth_rate_limits_expiresAt_idx` (`expiresAt`),
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
