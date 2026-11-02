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
('Aarti',12.915000,77.650000,2,'medium'),
('Tara',12.900000,77.625000,6,'high'),
('Imran',12.960000,77.665000,10,'critical'),
('Lakshmi',13.005000,77.570000,7,'critical'),
('Joseph',12.870000,77.600000,4,'medium'),
('Zoya',12.945000,77.705000,8,'medium'),
('Girish',13.040000,77.640000,5,'high');


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
('Central Emergency Depot',12.965000,77.590000),
('Ring Road Depot',12.950000,77.720000),
('Garden City Depot',12.915000,77.625000);


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
('Emergency Shelter',12.920000,77.550000,175,40),
('Ward Community Shelter',13.025000,77.575000,300,110),
('Eastside Relief Camp',12.965000,77.650000,350,130),
('Lakeside Hall Shelter',12.990000,77.690000,250,90);


-- =========================================================
-- 4. ROUTE
-- Final: 23
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
-- Final: 24
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
-- Final: 23
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
-- Final: 24
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
-- 8. USERS
-- Final: 3 (one per role)
--
-- password_hash holds bcrypt hashes only (enforced by CHECK).
-- DEV/DEMO seed accounts: change these passwords before any
-- real deployment.
-- =========================================================

INSERT INTO users
(username, full_name, password_hash, role)
VALUES
('admin','System Administrator','$2b$10$ZgHzW50/4sEyTDN/WtRvOO7mMv5rqbDQQBr2Jxj4TAoqgl/HTj9K.','admin'),
('logistics','Logistics Manager','$2b$10$zacEYkVoSbjUNt8lxqOk9.AqJjw3YxKHbwy5CjruzvsJxJBCzZOfS','logistics_manager'),
('fieldworker','Field Worker','$2b$10$33Y3T.9H9pUj7ny6RTfrcOXqHEu/2XAh2Tm/j.5hdk1tEt0qRZ7X.','field_worker');

