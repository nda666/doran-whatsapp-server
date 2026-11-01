CREATE TABLE `wa_incoming_effects` (
  `phoneId` VARCHAR(36) NOT NULL,
  `keyHash` CHAR(64) NOT NULL,
  `action` VARCHAR(16) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`phoneId`, `keyHash`, `action`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `wa_dispatch_recipient_created_idx` ON `wa_dispatches` (`userId`, `recipient`, `status`, `createdAt`);
CREATE INDEX `wa_dispatch_recipient_sent_idx` ON `wa_dispatches` (`userId`, `recipient`, `status`, `sentAt`);
CREATE INDEX `chat_message_receipt_idx` ON `chat_messages` (`waMessageId`, `direction`, `status`);
CREATE INDEX `chat_message_media_path_idx` ON `chat_messages` (`mediaPath`);
CREATE INDEX `chat_message_retention_idx` ON `chat_messages` (`createdAt`, `id`);
