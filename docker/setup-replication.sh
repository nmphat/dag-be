#!/bin/bash

echo "=========================================="
echo "   Setting up MySQL Replication Cluster   "
echo "=========================================="

# Function to check if MySQL is ready
wait_for_mysql() {
  local container=$1
  echo "Waiting for $container to be ready..."
  until docker exec $container mysql -uroot -prootpass123 -e "SELECT 1" > /dev/null 2>&1; do
    echo -n "."
    sleep 2
  done
  echo " $container is UP!"
}

# 1. Wait for all containers
wait_for_mysql "dag-mysql-master"
wait_for_mysql "dag-mysql-slave1"
wait_for_mysql "dag-mysql-slave2"

echo ""
echo "------------------------------------------"
echo "Configuring Slaves..."
echo "------------------------------------------"

# Function to configure slave
configure_slave() {
  local slave_container=$1
  
  echo "Configuring $slave_container..."
  docker exec -i $slave_container mysql -uroot -prootpass123 <<EOF
    STOP SLAVE;
    RESET SLAVE ALL;
    CHANGE MASTER TO
      MASTER_HOST='mysql-master',
      MASTER_USER='repl_user',
      MASTER_PASSWORD='replpass123',
      MASTER_AUTO_POSITION=1;
    START SLAVE;
    
    -- ENFORCE READ ONLY NOW (After init is complete)
    SET GLOBAL read_only = ON;
    SET GLOBAL super_read_only = ON;
EOF
}

configure_slave "dag-mysql-slave1"
configure_slave "dag-mysql-slave2"

echo ""
echo "------------------------------------------"
echo "Verifying Replication Status"
echo "------------------------------------------"

check_status() {
  local container=$1
  echo "Status of $container:"
  # Check for Slave_IO_Running and Slave_SQL_Running and Read_Only status
  docker exec -i $container mysql -uroot -prootpass123 -e "SHOW SLAVE STATUS\G" | grep -E "Slave_IO_Running|Slave_SQL_Running|Seconds_Behind_Master"
  docker exec -i $container mysql -uroot -prootpass123 -e "SELECT @@global.super_read_only as 'Read Only Mode';"
  echo ""
}

check_status "dag-mysql-slave1"
check_status "dag-mysql-slave2"

echo "✅ Setup Complete. Slaves are now READ-ONLY and Replicating."
