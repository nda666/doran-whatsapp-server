ALTER TABLE `phones` ADD COLUMN `saveIncomingSince` DATETIME(3) NULL;
UPDATE `phones` SET `saveIncomingSince` = UTC_TIMESTAMP(3) WHERE `saveIncomingMessages` = true;
