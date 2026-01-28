-- CreateTable
CREATE TABLE `concepts` (
    `id` VARCHAR(10) NOT NULL,
    `label` VARCHAR(255) NOT NULL,
    `definition` TEXT NULL,
    `level` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_label`(`label`),
    INDEX `idx_level`(`level`),
    INDEX `idx_label_level`(`label`, `level`),
    FULLTEXT INDEX `idx_label_fulltext`(`label`),
    FULLTEXT INDEX `idx_search_fulltext`(`label`, `definition`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `variants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `concept_id` VARCHAR(10) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_concept`(`concept_id`),
    INDEX `idx_name`(`name`),
    FULLTEXT INDEX `idx_name_fulltext`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `edges` (
    `parent_id` VARCHAR(10) NOT NULL,
    `child_id` VARCHAR(10) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_parent`(`parent_id`),
    INDEX `idx_child`(`child_id`),
    PRIMARY KEY (`parent_id`, `child_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `variants` ADD CONSTRAINT `variants_concept_id_fkey` FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `edges` ADD CONSTRAINT `edges_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `concepts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `edges` ADD CONSTRAINT `edges_child_id_fkey` FOREIGN KEY (`child_id`) REFERENCES `concepts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
