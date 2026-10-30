USE disaster;
-- =========================================================
-- 1. VICTIM
-- Final: 25
-- =========================================================

INSERT INTO victim
(name, latitude, longitude, group_size, priority)
VALUES
('Asha',12.971600,77.594600,4,'critical'),
('Ravi',12.935200,77.624500,2,'high'),
('Meena',12.958000,77.640000,6,'medium'),
('Karan',12.990000,77.550000,1,'low'),
('Neha',12.965000,77.605000,3,'medium'),
('Vikram',12.975000,77.615000,8,'critical'),
('Pooja',12.930000,77.590000,2,'low'),
('Manoj',12.985000,77.650000,5,'high'),
('Sneha',12.945000,77.625000,4,'medium'),
('Ramesh',12.905000,77.610000,6,'critical'),
('Kavya',13.015000,77.585000,2,'high'),
('Deepak',12.955000,77.675000,3,'low'),
('Nisha',12.925000,77.645000,5,'medium'),
('Amit',12.995000,77.600000,7,'critical'),
('Swati',12.935000,77.655000,2,'high'),
('Harish',12.885000,77.590000,4,'medium'),
('Preeti',13.025000,77.630000,3,'low'),
('Sanjay',12.970000,77.680000,6,'high'),
('Aarti',12.915000,77.650000,2,'medium');


-- =========================================================
-- 2. DEPOT
-- Final: 20
-- =========================================================

INSERT INTO depot
(name, latitude, longitude)
VALUES
('Central Depot',12.960000,77.600000),
('North Depot',13.030000,77.590000),
('West Depot',12.955000,77.570000),
('South East Depot',12.900000,77.650000),
('Hill View Depot',13.040000,77.620000),
('Lake Side Depot',12.880000,77.610000),
('Industrial Depot',12.920000,77.670000),
('Metro Depot',12.985000,77.640000),
('Airport Relief Depot',13.100000,77.590000),
('Railway Relief Depot',12.975000,77.580000),
('Market Depot',12.950000,77.690000),
('University Depot',12.940000,77.560000),
('Community Depot',13.020000,77.650000),
('Emergency Depot',12.910000,77.570000),
('East Relief Depot',12.970000,77.700000),
('South Relief Depot',12.860000,77.640000),
('North Relief Depot',13.060000,77.570000),
('Central Emergency Depot',12.965000,77.590000);


-- =========================================================
-- 3. SHELTER
-- Final: 20
-- =========================================================

INSERT INTO shelter
(name, latitude, longitude, capacity, occupancy)
VALUES
('City School Shelter',12.940000,77.610000,200,50),
('Stadium Shelter',12.985000,77.570000,500,120),
('Temple Shelter',12.960000,77.580000,250,60),
('Government School Shelter',12.930000,77.620000,350,120),
('Community Centre Shelter',12.980000,77.660000,180,70),
('Public Hall Shelter',12.900000,77.600000,220,90),
('College Auditorium',12.950000,77.670000,500,250),
('Municipal Shelter',13.020000,77.610000,300,100),
('Sports Stadium North',13.050000,77.600000,600,300),
('Village Community Hall',12.870000,77.620000,150,50),
('Metro Community Shelter',12.990000,77.650000,275,80),
('Relief Camp Alpha',12.910000,77.660000,400,150),
('Relief Camp Beta',12.940000,77.690000,450,200),
('Relief Camp Gamma',13.030000,77.680000,350,90),
('Relief Camp Delta',12.880000,77.570000,200,75),
('District Shelter',13.070000,77.590000,500,220),
('Emergency Shelter',12.920000,77.550000,175,40);


-- =========================================================
-- 4. ROUTE
-- Final: 29
-- =========================================================

INSERT INTO route
(depot_id, shelter_id, distance_km, status)
VALUES
(1,1,3.5,'open'),
(1,2,5.2,'open'),
(2,2,7.8,'blocked'),
(5,6,4.2,'open'),
(6,7,6.8,'open'),
(7,8,9.5,'blocked'),
(8,9,5.4,'open'),
(9,10,7.2,'open'),
(10,11,3.8,'open'),
(11,12,8.1,'blocked'),
(12,13,6.5,'open'),
(13,14,5.9,'open'),
(14,15,4.7,'open'),
(15,16,10.2,'blocked'),
(16,17,7.6,'open'),
(17,18,5.1,'open'),
(18,19,8.4,'open'),
(19,20,6.3,'blocked'),
(20,1,4.9,'open'),
(3,6,5.5,'open'),
(4,10,7.9,'blocked'),
(6,15,9.1,'open'),
(8,20,6.6,'open');


-- =========================================================
-- 5. SUPPLY
-- Final: 33
-- =========================================================

INSERT INTO supply
(depot_id, shelter_id, resource_type, quantity)
VALUES
(1,NULL,'water',100),
(2,NULL,'water',60),
(NULL,1,'medicine',30),
(NULL,2,'blankets',40),
(5,NULL,'water',150),
(6,NULL,'food',100),
(7,NULL,'medicine',75),
(8,NULL,'blankets',90),
(9,NULL,'water',200),
(10,NULL,'food',120),
(11,NULL,'medicine',60),
(12,NULL,'blankets',110),
(13,NULL,'water',180),
(14,NULL,'food',90),
(15,NULL,'medicine',80),
(16,NULL,'blankets',70),
(NULL,6,'water',50),
(NULL,7,'food',75),
(NULL,8,'medicine',40),
(NULL,9,'blankets',60),
(NULL,10,'water',100),
(NULL,11,'food',55),
(NULL,12,'medicine',35),
(NULL,13,'blankets',80);


-- =========================================================
-- 6. VEHICLE
-- Final: 28
-- =========================================================

INSERT INTO vehicle
(status, latitude, longitude, capacity)
VALUES
('available',12.962000,77.602000,100),
('available',13.000000,77.580000,50),
('maintenance',12.950000,77.600000,200),
('available',12.960000,77.610000,100),
('available',12.950000,77.620000,75),
('available',12.940000,77.630000,150),
('available',12.930000,77.640000,50),
('available',12.920000,77.650000,200),
('available',12.980000,77.620000,120),
('available',13.000000,77.630000,90),
('available',13.020000,77.640000,180),
('available',13.040000,77.650000,250),
('available',13.060000,77.600000,100),
('maintenance',12.900000,77.600000,150),
('available',12.880000,77.620000,80),
('available',12.910000,77.660000,130),
('available',12.930000,77.680000,70),
('available',12.950000,77.700000,220),
('maintenance',12.970000,77.680000,200),
('available',13.010000,77.670000,160),
('available',13.030000,77.690000,100),
('available',12.890000,77.650000,60),
('available',12.870000,77.630000,140);


-- =========================================================
-- 7. REQUEST
-- Final: 34
--
-- request_history entries are automatically created
-- by trg_req_ins for every request inserted.
-- =========================================================

INSERT INTO request
(person_id, resource_type, quantity, description)
VALUES
(1,'water',40,'Flooded area, no drinking water'),
(2,'medicine',10,'Injured family'),
(3,'food',20,'Group of 6 stranded'),
(4,'water',30,'Low urgency'),
(11,'water',20,'Drinking water required for family'),
(12,'food',30,'Food packets required urgently'),
(13,'medicine',10,'Basic medical supplies needed'),
(14,'blankets',15,'Blankets required for shelter'),
(15,'water',25,'Water shortage in affected area'),
(16,'food',40,'Food required for large family'),
(17,'medicine',20,'Medicine required for injured residents'),
(18,'water',35,'Emergency drinking water request'),
(19,'blankets',10,'Blankets required for children'),
(20,'food',15,'Food required for stranded group'),
(21,'water',50,'Large group needs drinking water'),
(22,'medicine',25,'Medical supplies urgently required'),
(23,'food',35,'Food packets needed'),
(24,'blankets',30,'Blankets required at relief camp'),
(25,'water',45,'Drinking water required'),
(11,'food',20,'Additional food requirement'),
(13,'water',15,'Water required for household'),
(15,'medicine',8,'First aid supplies required'),
(18,'food',25,'Food needed for displaced family'),
(22,'blankets',12,'Blankets needed at temporary shelter');


-- =========================================================
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

CREATE PROCEDURE sp_match_request(IN p_req INT)
BEGIN
  DECLARE v_type VARCHAR(50); DECLARE v_qty INT; DECLARE v_status VARCHAR(20);
  DECLARE v_lat DECIMAL(9,6); DECLARE v_lon DECIMAL(9,6);
  DECLARE v_supply INT; DECLARE v_slat DECIMAL(9,6); DECLARE v_slon DECIMAL(9,6);
  DECLARE v_veh INT; DECLARE v_vlat DECIMAL(9,6); DECLARE v_vlon DECIMAL(9,6);
  DECLARE v_dist DOUBLE; DECLARE v_eta INT;
  DECLARE CONTINUE HANDLER FOR NOT FOUND BEGIN END;

  SELECT r.resource_type,r.quantity,r.status,v.latitude,v.longitude
    INTO v_type,v_qty,v_status,v_lat,v_lon
    FROM request r JOIN victim v ON r.person_id=v.person_id
    WHERE r.request_id=p_req;

  IF v_status IS NULL OR v_status <> 'pending' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Request not found or not pending';
  END IF;

  -- nearest supply (depot or shelter) with enough stock
  SELECT s.supply_id, COALESCE(d.latitude,sh.latitude), COALESCE(d.longitude,sh.longitude)
    INTO v_supply,v_slat,v_slon
    FROM supply s
    LEFT JOIN depot d ON s.depot_id=d.depot_id
    LEFT JOIN shelter sh ON s.shelter_id=sh.shelter_id
    WHERE s.resource_type=v_type AND s.quantity>=v_qty
    ORDER BY fn_distance_km(v_lat,v_lon,COALESCE(d.latitude,sh.latitude),COALESCE(d.longitude,sh.longitude))
    LIMIT 1;
  IF v_supply IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='No supply available';
  END IF;

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
  VALUES (p_req,v_supply,v_veh,v_qty,v_eta);
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
