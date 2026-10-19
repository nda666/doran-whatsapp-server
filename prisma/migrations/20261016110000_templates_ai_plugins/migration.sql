ALTER TABLE `auto_replies` MODIFY `type` ENUM('text','image','button','template','list','webhook','ai') NOT NULL DEFAULT 'text';

CREATE TABLE `message_templates` (
  `id` VARCHAR(36) NOT NULL, `userId` VARCHAR(36) NOT NULL,
  `name` VARCHAR(200) NOT NULL, `content` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`), INDEX `message_templates_userId_updatedAt_idx` (`userId`, `updatedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ai_plugins` (
  `id` VARCHAR(36) NOT NULL, `userId` VARCHAR(36) NOT NULL, `provider` VARCHAR(16) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT false, `encryptedKey` TEXT NOT NULL,
  `model` VARCHAR(120) NOT NULL, `systemPrompt` TEXT NOT NULL,
  `maxOutputTokens` INTEGER NOT NULL DEFAULT 1024, `requestsPerMinute` INTEGER NOT NULL DEFAULT 10,
  `dailyLimit` INTEGER NOT NULL DEFAULT 1000, `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`), UNIQUE INDEX `ai_plugins_userId_provider_key` (`userId`, `provider`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ai_requests` (
  `id` VARCHAR(36) NOT NULL, `userId` VARCHAR(36) NOT NULL, `provider` VARCHAR(16) NOT NULL,
  `dedupeKey` CHAR(64) NOT NULL, `status` VARCHAR(16) NOT NULL, `error` VARCHAR(100) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`), UNIQUE INDEX `ai_requests_dedupeKey_key` (`dedupeKey`),
  INDEX `ai_requests_userId_provider_createdAt_idx` (`userId`, `provider`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
