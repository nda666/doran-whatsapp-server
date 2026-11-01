-- AlterTable
ALTER TABLE `device_daily_usage` ADD COLUMN `replies` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `sendHours` JSON NULL;
