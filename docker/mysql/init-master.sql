-- 1. Create Replication User
CREATE USER IF NOT EXISTS 'repl_user'@'%' IDENTIFIED BY 'replpass123';
GRANT REPLICATION SLAVE ON *.* TO 'repl_user'@'%';

-- 2. Create Application User (For NestJS)
-- Ensure this user can connect from anywhere
CREATE USER IF NOT EXISTS 'app_user'@'%' IDENTIFIED BY 'apppass123';
GRANT ALL PRIVILEGES ON dag_db.* TO 'app_user'@'%';

FLUSH PRIVILEGES;

-- 3. Verify
USE dag_db;
SHOW MASTER STATUS;
