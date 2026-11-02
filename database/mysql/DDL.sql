DROP DATABASE IF EXISTS disaster;
CREATE DATABASE disaster;
USE disaster; 
CREATE TABLE victim (
    person_id    INT PRIMARY KEY AUTO_INCREMENT,
    name         VARCHAR(150),
    latitude     DECIMAL(9,6) NOT NULL,
    longitude    DECIMAL(9,6) NOT NULL,
    group_size   INT DEFAULT 1,
    priority     ENUM('critical','high','medium','low') DEFAULT 'medium'
);

CREATE TABLE depot (
    depot_id     INT PRIMARY KEY AUTO_INCREMENT,
    name         VARCHAR(150) NOT NULL,
    latitude     DECIMAL(9,6) NOT NULL,
    longitude    DECIMAL(9,6) NOT NULL
);

CREATE TABLE shelter (
    shelter_id   INT PRIMARY KEY AUTO_INCREMENT,
    name         VARCHAR(150) NOT NULL,
    latitude     DECIMAL(9,6) NOT NULL,
    longitude    DECIMAL(9,6) NOT NULL,
    capacity     INT NOT NULL,
    occupancy    INT DEFAULT 0,
    CHECK (occupancy >= 0 AND occupancy <= capacity)
);

CREATE TABLE route (
    route_id     INT PRIMARY KEY AUTO_INCREMENT,
    depot_id     INT NOT NULL,
    shelter_id   INT NOT NULL,
    distance_km  DECIMAL(6,2),
    status       ENUM('open','blocked') DEFAULT 'open',
    FOREIGN KEY (depot_id) REFERENCES depot(depot_id),
    FOREIGN KEY (shelter_id) REFERENCES shelter(shelter_id)
);

CREATE TABLE supply (
    supply_id     INT PRIMARY KEY AUTO_INCREMENT,
    depot_id      INT,
    shelter_id    INT,
    resource_type VARCHAR(50) NOT NULL,
    quantity      INT NOT NULL,
    CHECK (quantity >= 0),
    CHECK ((shelter_id IS NOT NULL AND depot_id IS NULL)
        OR (shelter_id IS NULL AND depot_id IS NOT NULL)),
    -- one stock row per location and resource type, so "what a depot holds" is a single
    -- number (NULLs never collide, so each key only applies to its own kind of location)
    UNIQUE (depot_id, resource_type),
    UNIQUE (shelter_id, resource_type),
    FOREIGN KEY (depot_id) REFERENCES depot(depot_id),
    FOREIGN KEY (shelter_id) REFERENCES shelter(shelter_id)
);

CREATE TABLE vehicle (
    vehicle_id   INT PRIMARY KEY AUTO_INCREMENT,
    status       ENUM('available','en_route','maintenance') DEFAULT 'available',
    latitude     DECIMAL(9,6),
    longitude    DECIMAL(9,6),
    capacity     INT NOT NULL
);

CREATE TABLE request (
    request_id    INT PRIMARY KEY AUTO_INCREMENT,
    person_id     INT NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    quantity      INT NOT NULL CHECK (quantity > 0),
    status        ENUM('pending','matched','delivered','cancelled') DEFAULT 'pending',
    requested_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    FOREIGN KEY (person_id) REFERENCES victim(person_id)
);

CREATE TABLE match_assignment (
    match_id     INT PRIMARY KEY AUTO_INCREMENT,
    request_id   INT NOT NULL UNIQUE,
    supply_id    INT NOT NULL,
    vehicle_id   INT,
    assigned_qty INT NOT NULL CHECK (assigned_qty > 0),
    eta_minutes  INT,
    matched_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES request(request_id),
    FOREIGN KEY (supply_id) REFERENCES supply(supply_id),
    FOREIGN KEY (vehicle_id) REFERENCES vehicle(vehicle_id)
);

CREATE TABLE request_history (
    history_id   INT PRIMARY KEY AUTO_INCREMENT,
    request_id   INT NOT NULL,
    old_status   VARCHAR(20),
    new_status   VARCHAR(20),
    changed_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES request(request_id)
);

CREATE TABLE users (
    user_id        INT PRIMARY KEY AUTO_INCREMENT,
    username       VARCHAR(50) NOT NULL UNIQUE,
    full_name      VARCHAR(150),
    password_hash  VARCHAR(255) NOT NULL,
    role           ENUM('admin','logistics_manager','field_worker') NOT NULL DEFAULT 'field_worker',
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (CHAR_LENGTH(username) >= 3),
    -- passwords must be stored as bcrypt hashes, never plain text
    CHECK (CHAR_LENGTH(password_hash) = 60 AND password_hash LIKE '$2_$%')
);


-- ========================================================
-- FUNCTIONS
-- =========================================================

CREATE FUNCTION fn_distance_km(lat1 DOUBLE, lon1 DOUBLE, lat2 DOUBLE, lon2 DOUBLE)
RETURNS DOUBLE DETERMINISTIC
RETURN 6371*2*ASIN(SQRT(POW(SIN(RADIANS(lat2-lat1)/2),2)
  + COS(RADIANS(lat1))*COS(RADIANS(lat2))*POW(SIN(RADIANS(lon2-lon1)/2),2)));

CREATE FUNCTION fn_shelter_free(p_id INT) RETURNS INT DETERMINISTIC
RETURN (SELECT capacity-occupancy FROM shelter WHERE shelter_id=p_id);

-- =========================================================
-- TRIGGERS
-- =========================================================

DELIMITER //
CREATE TRIGGER trg_req_ins AFTER INSERT ON request FOR EACH ROW
BEGIN
  INSERT INTO request_history(request_id,old_status,new_status)
  VALUES (NEW.request_id,NULL,NEW.status);
END//

CREATE TRIGGER trg_req_upd AFTER UPDATE ON request FOR EACH ROW
BEGIN
  IF OLD.status <> NEW.status THEN
    INSERT INTO request_history(request_id,old_status,new_status)
    VALUES (NEW.request_id,OLD.status,NEW.status);
  END IF;
END//

CREATE TRIGGER trg_match_bi BEFORE INSERT ON match_assignment FOR EACH ROW
BEGIN
  DECLARE v_have INT; DECLARE v_t1 VARCHAR(50); DECLARE v_t2 VARCHAR(50);
  SELECT quantity,resource_type INTO v_have,v_t1 FROM supply WHERE supply_id=NEW.supply_id;
  SELECT resource_type INTO v_t2 FROM request WHERE request_id=NEW.request_id;
  IF v_t1 <> v_t2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Resource type mismatch';
  END IF;
  IF v_have < NEW.assigned_qty THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Insufficient supply';
  END IF;
END//

CREATE TRIGGER trg_match_ai AFTER INSERT ON match_assignment FOR EACH ROW
BEGIN
  UPDATE supply SET quantity=quantity-NEW.assigned_qty WHERE supply_id=NEW.supply_id;
  UPDATE request SET status='matched' WHERE request_id=NEW.request_id;
  IF NEW.vehicle_id IS NOT NULL THEN
    UPDATE vehicle SET status='en_route' WHERE vehicle_id=NEW.vehicle_id;
  END IF;
END//

DELIMITER ;


-- =========================================================
-- PROCEDURES
-- =========================================================

DELIMITER //

-- Shared last step: nearest free vehicle to the supply point, ETA, then the INSERT
-- (trg_match_bi re-checks type and stock, trg_match_ai deducts stock and updates statuses).
CREATE PROCEDURE sp_assign_supply(IN p_req INT, IN p_supply INT)
BEGIN
  DECLARE v_qty INT;
  DECLARE v_lat DECIMAL(9,6); DECLARE v_lon DECIMAL(9,6);
  DECLARE v_slat DECIMAL(9,6); DECLARE v_slon DECIMAL(9,6);
  DECLARE v_veh INT; DECLARE v_vlat DECIMAL(9,6); DECLARE v_vlon DECIMAL(9,6);
  DECLARE v_dist DOUBLE; DECLARE v_eta INT;
  DECLARE CONTINUE HANDLER FOR NOT FOUND BEGIN END;

  SELECT r.quantity,v.latitude,v.longitude INTO v_qty,v_lat,v_lon
    FROM request r JOIN victim v ON r.person_id=v.person_id
    WHERE r.request_id=p_req;

  SELECT COALESCE(d.latitude,sh.latitude), COALESCE(d.longitude,sh.longitude) INTO v_slat,v_slon
    FROM supply s
    LEFT JOIN depot d ON s.depot_id=d.depot_id
    LEFT JOIN shelter sh ON s.shelter_id=sh.shelter_id
    WHERE s.supply_id=p_supply;

  -- nearest available vehicle to the supply point
  SELECT vehicle_id,latitude,longitude INTO v_veh,v_vlat,v_vlon
    FROM vehicle
    WHERE status='available' AND capacity>=v_qty
    ORDER BY fn_distance_km(v_slat,v_slon,latitude,longitude) LIMIT 1;
  IF v_veh IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='No vehicle available';
  END IF;

  SET v_dist = fn_distance_km(v_vlat,v_vlon,v_slat,v_slon) + fn_distance_km(v_slat,v_slon,v_lat,v_lon);
  SET v_eta  = CEIL(v_dist/40*60);   -- assumes 40 km/h

  INSERT INTO match_assignment(request_id,supply_id,vehicle_id,assigned_qty,eta_minutes)
  VALUES (p_req,p_supply,v_veh,v_qty,v_eta);
END//

-- Automatic: nearest supply (depot or shelter) that holds enough stock.
CREATE PROCEDURE sp_match_request(IN p_req INT)
BEGIN
  DECLARE v_type VARCHAR(50); DECLARE v_qty INT; DECLARE v_status VARCHAR(20);
  DECLARE v_lat DECIMAL(9,6); DECLARE v_lon DECIMAL(9,6);
  DECLARE v_supply INT;
  DECLARE CONTINUE HANDLER FOR NOT FOUND BEGIN END;

  SELECT r.resource_type,r.quantity,r.status,v.latitude,v.longitude
    INTO v_type,v_qty,v_status,v_lat,v_lon
    FROM request r JOIN victim v ON r.person_id=v.person_id
    WHERE r.request_id=p_req;

  IF v_status IS NULL OR v_status <> 'pending' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Request not found or not pending';
  END IF;

  SELECT s.supply_id INTO v_supply
    FROM supply s
    LEFT JOIN depot d ON s.depot_id=d.depot_id
    LEFT JOIN shelter sh ON s.shelter_id=sh.shelter_id
    WHERE s.resource_type=v_type AND s.quantity>=v_qty
    ORDER BY fn_distance_km(v_lat,v_lon,COALESCE(d.latitude,sh.latitude),COALESCE(d.longitude,sh.longitude))
    LIMIT 1;
  IF v_supply IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='No supply available';
  END IF;

  CALL sp_assign_supply(p_req, v_supply);
END//

-- Chosen depot: fails with the requested and available amounts if it can't cover the request.
CREATE PROCEDURE sp_match_request_at_depot(IN p_req INT, IN p_depot INT)
BEGIN
  DECLARE v_type VARCHAR(50); DECLARE v_qty INT; DECLARE v_status VARCHAR(20);
  DECLARE v_supply INT; DECLARE v_have INT; DECLARE v_msg VARCHAR(128);
  DECLARE CONTINUE HANDLER FOR NOT FOUND BEGIN END;

  SELECT resource_type,quantity,status INTO v_type,v_qty,v_status
    FROM request WHERE request_id=p_req;
  IF v_status IS NULL OR v_status <> 'pending' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Request not found or not pending';
  END IF;

  SELECT supply_id,quantity INTO v_supply,v_have
    FROM supply WHERE depot_id=p_depot AND resource_type=v_type;
  IF v_supply IS NULL THEN
    SET v_msg = CONCAT('Depot has no ',v_type,' in stock');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg;
  END IF;
  IF v_have < v_qty THEN
    SET v_msg = CONCAT('Insufficient supply at depot: requested ',v_qty,', available ',v_have);
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_msg;
  END IF;

  CALL sp_assign_supply(p_req, v_supply);
END//

CREATE PROCEDURE sp_match_all_pending()
BEGIN
  DECLARE done INT DEFAULT 0; DECLARE rid INT;
  DECLARE cur CURSOR FOR
    SELECT r.request_id FROM request r JOIN victim v ON r.person_id=v.person_id
    WHERE r.status='pending'
    ORDER BY FIELD(v.priority,'critical','high','medium','low'), v.group_size DESC, r.requested_at;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done=1;
  OPEN cur;
  lp: LOOP
    FETCH cur INTO rid;
    IF done THEN LEAVE lp; END IF;
    BEGIN
      DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;  -- skip unmatchable requests
      CALL sp_match_request(rid);
    END;
  END LOOP;
  CLOSE cur;
END//

CREATE PROCEDURE sp_complete_delivery(IN p_match INT)
BEGIN
  DECLARE v_req INT; DECLARE v_veh INT;
  SELECT request_id,vehicle_id INTO v_req,v_veh FROM match_assignment WHERE match_id=p_match;
  UPDATE request SET status='delivered' WHERE request_id=v_req;
  UPDATE vehicle SET status='available' WHERE vehicle_id=v_veh;
END//

DELIMITER ;

