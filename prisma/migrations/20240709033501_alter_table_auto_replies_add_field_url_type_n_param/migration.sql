-- AlterTable
ALTER TABLE `auto_replies` ADD COLUMN `isi_param_1` ENUM('Sender', 'Recipient', 'Message', 'Custom') NULL,
    ADD COLUMN `isi_param_2` ENUM('Sender', 'Recipient', 'Message', 'Custom') NULL,
    ADD COLUMN `isi_param_3` ENUM('Sender', 'Recipient', 'Message', 'Custom') NULL,
    ADD COLUMN `param_1` VARCHAR(191) NULL,
    ADD COLUMN `param_2` VARCHAR(191) NULL,
    ADD COLUMN `param_3` VARCHAR(191) NULL,
    ADD COLUMN `type_request` ENUM('Get', 'Post') NULL,
    ADD COLUMN `url` TEXT NULL;
