-- AlterTable
ALTER TABLE `inbox_messages` ADD COLUMN `isi_param_1` ENUM('Sender', 'Recipient', 'Message', 'Custom') NULL,
    ADD COLUMN `isi_param_2` ENUM('Sender', 'Recipient', 'Message', 'Custom') NULL,
    ADD COLUMN `isi_param_3` ENUM('Sender', 'Recipient', 'Message', 'Custom') NULL,
    ADD COLUMN `param_1` TEXT NULL,
    ADD COLUMN `param_2` TEXT NULL,
    ADD COLUMN `param_3` TEXT NULL,
    ADD COLUMN `respons` TEXT NULL,
    ADD COLUMN `type_request` ENUM('Get', 'Post') NULL,
    ADD COLUMN `url` TEXT NULL;
