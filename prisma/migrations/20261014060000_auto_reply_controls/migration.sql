ALTER TABLE `phones` ADD COLUMN `autoReplyEnabled` BOOLEAN NOT NULL DEFAULT false;

-- Preserve existing active automations; devices without active rules stay off.
UPDATE `phones` p SET p.`autoReplyEnabled` = true
WHERE EXISTS (SELECT 1 FROM `auto_replies` r WHERE r.`phoneId` = p.`id` AND r.`reply_status` = 'active');

ALTER TABLE `auto_replies` MODIFY `reply_status` ENUM('active', 'inactive') NOT NULL DEFAULT 'inactive';
