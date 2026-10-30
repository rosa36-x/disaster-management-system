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
