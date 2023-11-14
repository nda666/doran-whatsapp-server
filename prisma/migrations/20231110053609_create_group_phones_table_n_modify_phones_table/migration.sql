-- CreateTable
CREATE TABLE `groups` (
    `id` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `creation` DATETIME(3) NULL,
    `size` INTEGER NULL,
    `owner` VARCHAR(191) NOT NULL,
    `desc` TEXT NULL,
    `restrict` BOOLEAN NOT NULL DEFAULT false,
    `announce` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GroupsOnPhones` (
    `phoneId` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`phoneId`, `groupId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GroupsOnPhones` ADD CONSTRAINT `GroupsOnPhones_phoneId_fkey` FOREIGN KEY (`phoneId`) REFERENCES `phones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GroupsOnPhones` ADD CONSTRAINT `GroupsOnPhones_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
