-- MySQL dump 10.13  Distrib 8.0.44, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: ultimate_cad
-- ------------------------------------------------------
-- Server version	8.0.44

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `bolos`
--

DROP TABLE IF EXISTS `bolos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bolos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `server_id` int NOT NULL,
  `type` enum('Vehicle','Person','Ped') NOT NULL,
  `reason` varchar(256) NOT NULL,
  `description` text NOT NULL,
  `active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `server_id` (`server_id`),
  CONSTRAINT `bolo_server_fk` FOREIGN KEY (`server_id`) REFERENCES `servers` (`idserver`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `calls`
--

DROP TABLE IF EXISTS `calls`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `calls` (
  `id` int NOT NULL AUTO_INCREMENT,
  `server_id` int NOT NULL,
  `nature` varchar(128) NOT NULL,
  `location` varchar(128) NOT NULL,
  `priority` enum('Low','Medium','High','Critical') DEFAULT 'Low',
  `status` enum('ACTIVE','CLOSED') DEFAULT 'ACTIVE',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `closed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `server_id` (`server_id`),
  CONSTRAINT `call_server_fk` FOREIGN KEY (`server_id`) REFERENCES `servers` (`idserver`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

ALTER TABLE calls
  ADD COLUMN pos_x DOUBLE DEFAULT NULL,
  ADD COLUMN pos_z DOUBLE DEFAULT NULL;

--
-- Table structure for table `characters`
--

DROP TABLE IF EXISTS `characters`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `characters` (
  `id` int NOT NULL AUTO_INCREMENT,
  `server_id` int NOT NULL,
  `user_id` int NOT NULL,
  `first_name` varchar(64) NOT NULL,
  `last_name` varchar(64) NOT NULL,
  `dob` varchar(16) NOT NULL,
  `gender` varchar(32) DEFAULT NULL,
  `occupation` varchar(64) DEFAULT NULL,
  `height` varchar(16) DEFAULT NULL,
  `weight` varchar(16) DEFAULT NULL,
  `skin_tone` varchar(32) DEFAULT NULL,
  `hair_tone` varchar(32) DEFAULT NULL,
  `eye_color` varchar(32) DEFAULT NULL,
  `address` varchar(128) DEFAULT NULL,
  `flags` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `server_id` (`server_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `char_server_fk` FOREIGN KEY (`server_id`) REFERENCES `servers` (`idserver`) ON DELETE CASCADE,
  CONSTRAINT `char_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`iduser`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `firearms`
--

DROP TABLE IF EXISTS `firearms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `firearms` (
  `id` int NOT NULL AUTO_INCREMENT,
  `server_id` int NOT NULL,
  `owner_id` int DEFAULT NULL,
  `serial` varchar(32) NOT NULL,
  `name` varchar(64) DEFAULT NULL,
  `type` varchar(64) NOT NULL,
  `stolen` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `server_id` (`server_id`),
  KEY `owner_id` (`owner_id`),
  CONSTRAINT `fa_char_fk` FOREIGN KEY (`owner_id`) REFERENCES `characters` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fa_server_fk` FOREIGN KEY (`server_id`) REFERENCES `servers` (`idserver`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `reports`
--

DROP TABLE IF EXISTS `reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `server_id` int NOT NULL,
  `officer_id` int DEFAULT NULL,
  `call_id` int DEFAULT NULL,
  `type` varchar(64) NOT NULL,
  `subject_name` varchar(128) DEFAULT NULL,
  `subject_plate` varchar(16) DEFAULT NULL,
  `details` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `server_id` (`server_id`),
  CONSTRAINT `rep_server_fk` FOREIGN KEY (`server_id`) REFERENCES `servers` (`idserver`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `server_audit_log`
--

DROP TABLE IF EXISTS `server_audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `server_audit_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `server_id` int NOT NULL,
  `user_id` int NOT NULL,
  `action` varchar(64) NOT NULL,
  `target_type` varchar(64) DEFAULT NULL,
  `target_id` int DEFAULT NULL,
  `details` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `server_id` (`server_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `sal_server_fk` FOREIGN KEY (`server_id`) REFERENCES `servers` (`idserver`) ON DELETE CASCADE,
  CONSTRAINT `sal_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`iduser`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_sessions`
--

DROP TABLE IF EXISTS `user_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `user_agent` varchar(512) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `revoked` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `token_hash` (`token_hash`),
  CONSTRAINT `us_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`iduser`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `server_members`
--

DROP TABLE IF EXISTS `server_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `server_members` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `server_id` int NOT NULL,
  `joined_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_member` (`user_id`,`server_id`),
  KEY `server_id` (`server_id`),
  CONSTRAINT `sm_server_fk` FOREIGN KEY (`server_id`) REFERENCES `servers` (`idserver`) ON DELETE CASCADE,
  CONSTRAINT `sm_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`iduser`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `servers`
--

DROP TABLE IF EXISTS `servers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `servers` (
  `idserver` int NOT NULL AUTO_INCREMENT,
  `discord_id` varchar(32) DEFAULT NULL,
  `name` varchar(128) NOT NULL,
  `join_code` varchar(32) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `icon_url` varchar(512) DEFAULT NULL,
  `owner_id` int NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idserver`),
  UNIQUE KEY `join_code` (`join_code`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `units`
--

DROP TABLE IF EXISTS `departments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `departments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `server_id` int NOT NULL,
  `name` varchar(128) NOT NULL,
  `type` enum('LEO','FR','DOT') NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `min_weekly_activity` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `server_id` (`server_id`),
  CONSTRAINT `dept_server_fk` FOREIGN KEY (`server_id`) REFERENCES `servers` (`idserver`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `units`
--

DROP TABLE IF EXISTS `units`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `units` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `server_id` int NOT NULL,
  `name` varchar(64) NOT NULL,
  `callsign` varchar(32) NOT NULL,
  `department` varchar(128) NOT NULL,
  `status` enum('AVAILABLE','UNAVAILABLE','ON SCENE','ENROUTE','BUSY') DEFAULT 'AVAILABLE',
  `current_call` int DEFAULT NULL,
  `location` varchar(128) DEFAULT '',
  `clocked_in` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `server_id` (`server_id`),
  CONSTRAINT `off_server_fk` FOREIGN KEY (`server_id`) REFERENCES `servers` (`idserver`) ON DELETE CASCADE,
  CONSTRAINT `off_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`iduser`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `iduser` int NOT NULL AUTO_INCREMENT,
  `discord_id` varchar(32) NOT NULL,
  `username` varchar(64) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`iduser`),
  UNIQUE KEY `discord_id` (`discord_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `vehicles`
--

DROP TABLE IF EXISTS `vehicles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `server_id` int NOT NULL,
  `owner_id` int DEFAULT NULL,
  `plate` varchar(16) NOT NULL,
  `vin` varchar(32) DEFAULT NULL,
  `model` varchar(64) NOT NULL,
  `color` varchar(32) DEFAULT NULL,
  `registration_expiry` varchar(16) DEFAULT NULL,
  `insurance_status` enum('Active','Expired') DEFAULT 'Active',
  `insurance_expiry` varchar(16) DEFAULT NULL,
  `stolen` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `server_id` (`server_id`),
  KEY `owner_id` (`owner_id`),
  CONSTRAINT `veh_char_fk` FOREIGN KEY (`owner_id`) REFERENCES `characters` (`id`) ON DELETE SET NULL,
  CONSTRAINT `veh_server_fk` FOREIGN KEY (`server_id`) REFERENCES `servers` (`idserver`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `verification_codes`
--

DROP TABLE IF EXISTS `verification_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `verification_codes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `code` varchar(10) NOT NULL,
  `action` varchar(64) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `used` tinyint(1) DEFAULT '0',
  `attempts` int NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `vc_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`iduser`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

--
-- Table structure for table `dept_ranks`
--

DROP TABLE IF EXISTS `dept_member_roles`;
DROP TABLE IF EXISTS `dept_roles`;
DROP TABLE IF EXISTS `dept_members`;
DROP TABLE IF EXISTS `dept_ranks`;
DROP TABLE IF EXISTS `dept_docs`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dept_ranks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dept_id` int NOT NULL,
  `name` varchar(64) NOT NULL,
  `permissions` json DEFAULT ('[]'),
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `dept_id` (`dept_id`),
  CONSTRAINT `dr_dept_fk` FOREIGN KEY (`dept_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dept_members`
--

DROP TABLE IF EXISTS `dept_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dept_members` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dept_id` int NOT NULL,
  `user_id` int NOT NULL,
  `rank_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_dept_user` (`dept_id`,`user_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `dm_dept_fk` FOREIGN KEY (`dept_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `dm_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`iduser`) ON DELETE CASCADE,
  CONSTRAINT `dm_rank_fk` FOREIGN KEY (`rank_id`) REFERENCES `dept_ranks` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dept_roles`
--

DROP TABLE IF EXISTS `dept_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dept_roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dept_id` int NOT NULL,
  `name` varchar(64) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `dept_id` (`dept_id`),
  CONSTRAINT `dro_dept_fk` FOREIGN KEY (`dept_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dept_member_roles`
--

DROP TABLE IF EXISTS `dept_member_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dept_member_roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `member_id` int NOT NULL,
  `role_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_member_role` (`member_id`,`role_id`),
  CONSTRAINT `dmr_member_fk` FOREIGN KEY (`member_id`) REFERENCES `dept_members` (`id`) ON DELETE CASCADE,
  CONSTRAINT `dmr_role_fk` FOREIGN KEY (`role_id`) REFERENCES `dept_roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dept_docs`
--

DROP TABLE IF EXISTS `dept_docs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dept_docs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dept_id` int NOT NULL,
  `title` varchar(128) NOT NULL,
  `url` varchar(512) NOT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `dept_id` (`dept_id`),
  CONSTRAINT `dd_dept_fk` FOREIGN KEY (`dept_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dept_infractions`
--

DROP TABLE IF EXISTS `dept_infractions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dept_infractions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dept_id` int NOT NULL,
  `member_id` int NOT NULL,
  `given_by_user_id` int DEFAULT NULL,
  `reason` varchar(512) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `dept_id` (`dept_id`),
  KEY `member_id` (`member_id`),
  CONSTRAINT `di_dept_fk` FOREIGN KEY (`dept_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `di_member_fk` FOREIGN KEY (`member_id`) REFERENCES `dept_members` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dept_activity_log`
--

DROP TABLE IF EXISTS `dept_activity_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dept_activity_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dept_id` int NOT NULL,
  `member_id` int NOT NULL,
  `user_id` int NOT NULL,
  `action_type` enum('CLOCK_IN','REPORT') NOT NULL DEFAULT 'CLOCK_IN',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `dept_id` (`dept_id`),
  KEY `member_id` (`member_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `dal_dept_fk` FOREIGN KEY (`dept_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `dal_member_fk` FOREIGN KEY (`member_id`) REFERENCES `dept_members` (`id`) ON DELETE CASCADE,
  CONSTRAINT `dal_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`iduser`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

-- Dump completed on 2026-04-17 23:48:15


-- Migration 005: Add assigned_vehicles_enabled to departments and dept_vehicles table
-- Run: mysql -u root -p ultimate_cad < config/migration-005-dept-vehicles.sql

-- ── Add assigned_vehicles_enabled column to departments ────────
ALTER TABLE `departments`
  ADD COLUMN `assigned_vehicles_enabled` tinyint(1) NOT NULL DEFAULT '0';

-- ── dept_vehicles table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS `dept_vehicles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dept_id` int NOT NULL,
  `name` varchar(64) NOT NULL,
  `model` varchar(64) DEFAULT NULL,
  `plate` varchar(16) DEFAULT NULL,
  `color` varchar(32) DEFAULT NULL,
  `assigned_to_unit_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `dept_id` (`dept_id`),
  KEY `assigned_to_unit_id` (`assigned_to_unit_id`),
  CONSTRAINT `dv_dept_fk` FOREIGN KEY (`dept_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `dv_unit_fk` FOREIGN KEY (`assigned_to_unit_id`) REFERENCES `units` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Migration 004: Add user_sessions and server_audit_log tables
-- Run: mysql -u root -p ultimate_cad < config/migration-004-user-sessions.sql

-- ── user_sessions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `user_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `user_agent` varchar(512) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `revoked` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `token_hash` (`token_hash`),
  CONSTRAINT `us_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`iduser`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── server_audit_log ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `server_audit_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `server_id` int NOT NULL,
  `user_id` int NOT NULL,
  `action` varchar(64) NOT NULL,
  `target_type` varchar(64) DEFAULT NULL,
  `target_id` int DEFAULT NULL,
  `details` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `server_id` (`server_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `sal_server_fk` FOREIGN KEY (`server_id`) REFERENCES `servers` (`idserver`) ON DELETE CASCADE,
  CONSTRAINT `sal_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`iduser`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
