
// ============================================================
// DISASTER RELIEF MANAGEMENT SYSTEM
// MongoDB Commands
// Database: disaster_relief
// MongoDB Version: 7
// ============================================================

// Select database
db = db.getSiblingDB("disaster_relief");

// ============================================================
// 1. CREATE COLLECTIONS
// ============================================================

if (!db.getCollectionNames().includes("incident_reports")) {
    db.createCollection("incident_reports");
}

if (!db.getCollectionNames().includes("field_updates")) {
    db.createCollection("field_updates");
}

// ============================================================
// 2. INSERT INCIDENT REPORTS
// ============================================================

const incidentResult = db.incident_reports.insertMany([
    {
        title: "Flood in residential area",
        disaster_type: "Flood",
        severity: "critical",
        location: {
            type: "Point",
            coordinates: [77.602, 12.962]
        },
        description: "Several houses are submerged and residents need immediate assistance.",
        related_request_ids: [1, 2],
        reported_by: "Admin",
        created_at: new Date()
    },
    {
        title: "Road damage after heavy rainfall",
        disaster_type: "Landslide",
        severity: "high",
        location: {
            type: "Point",
            coordinates: [77.580, 13.000]
        },
        description: "Road access is blocked due to fallen rocks and debris.",
        related_request_ids: [3],
        reported_by: "Relief Staff",
        created_at: new Date()
    },
    {
        title: "Shortage of drinking water",
        disaster_type: "Drought",
        severity: "medium",
        location: {
            type: "Point",
            coordinates: [77.610, 12.950]
        },
        description: "Local residents have reported a shortage of clean drinking water.",
        related_request_ids: [4],
        reported_by: "Relief Staff",
        created_at: new Date()
    }
]);

print("Incident reports inserted:");
printjson(incidentResult.insertedIds);

// ============================================================
// 3. INSERT FIELD UPDATES
// ============================================================

const updateResult = db.field_updates.insertMany([
    {
        incident_title: "Flood in residential area",
        incident_report_index: 1,
        worker_name: "Relief Worker 1",
        situation: "Water levels are rising.",
        damage_observed: "Multiple houses are submerged.",
        additional_requirements: [
            "Drinking water",
            "Food",
            "Medicine"
        ],
        created_at: new Date()
    },
    {
        incident_title: "Road damage after heavy rainfall",
        incident_report_index: 2,
        worker_name: "Relief Worker 2",
        situation: "Road remains inaccessible.",
        damage_observed: "Debris is blocking vehicle movement.",
        additional_requirements: ["Rescue equipment"],
        created_at: new Date()
    },
    {
        incident_title: "Shortage of drinking water",
        incident_report_index: 3,
        worker_name: "Relief Worker 3",
        situation: "Water distribution is underway.",
        damage_observed: "No major physical damage reported.",
        additional_requirements: ["Drinking water"],
        created_at: new Date()
    }
]);

print("Field updates inserted:");
printjson(updateResult.insertedIds);

// ============================================================
// 4. LINK FIELD UPDATES TO INCIDENT REPORTS
// ============================================================

const incident1 = db.incident_reports.findOne(
    { title: "Flood in residential area" },
    { _id: 1 }
);

const incident2 = db.incident_reports.findOne(
    { title: "Road damage after heavy rainfall" },
    { _id: 1 }
);

const incident3 = db.incident_reports.findOne(
    { title: "Shortage of drinking water" },
    { _id: 1 }
);

db.field_updates.updateOne(
    { worker_name: "Relief Worker 1" },
    { $set: { incident_report_id: incident1._id } }
);

db.field_updates.updateOne(
    { worker_name: "Relief Worker 2" },
    { $set: { incident_report_id: incident2._id } }
);

db.field_updates.updateOne(
    { worker_name: "Relief Worker 3" },
    { $set: { incident_report_id: incident3._id } }
);

// ============================================================
// 5. CREATE GEOSPATIAL INDEX
// ============================================================

db.incident_reports.createIndex({
    location: "2dsphere"
});

// ============================================================
// 6. DISPLAY ALL DOCUMENTS
// ============================================================

print("All incident reports:");
printjson(db.incident_reports.find().toArray());

print("All field updates:");
printjson(db.field_updates.find().toArray());

// ============================================================
// 7. COUNT DOCUMENTS
// ============================================================

print("Total incident reports:");
print(db.incident_reports.countDocuments());

print("Total field updates:");
print(db.field_updates.countDocuments());

// ============================================================
// 8. FIND CRITICAL INCIDENTS
// ============================================================

print("Critical incidents:");

printjson(
    db.incident_reports.find({
        severity: "critical"
    }).toArray()
);

// ============================================================
// 9. FIND FLOOD INCIDENTS
// ============================================================

print("Flood incidents:");

printjson(
    db.incident_reports.find({
        disaster_type: "Flood"
    }).toArray()
);

// ============================================================
// 10. FIND FIELD UPDATES REQUIRING DRINKING WATER
// ============================================================

print("Field updates requiring drinking water:");

printjson(
    db.field_updates.find({
        additional_requirements: "Drinking water"
    }).toArray()
);

// ============================================================
// 11. AGGREGATION: COUNT INCIDENTS BY SEVERITY
// ============================================================

print("Incident count by severity:");

printjson(
    db.incident_reports.aggregate([
        {
            $group: {
                _id: "$severity",
                total_incidents: { $sum: 1 }
            }
        }
    ]).toArray()
);

// ============================================================
// 12. GEOSPATIAL QUERY: FIND INCIDENTS WITHIN 10 KM
// ============================================================

print("Incidents within 10 km:");

printjson(
    db.incident_reports.find({
        location: {
            $near: {
                $geometry: {
                    type: "Point",
                    coordinates: [77.602, 12.962]
                },
                $maxDistance: 10000
            }
        }
    }).toArray()
);

// ============================================================
// 13. VERIFY INCIDENT REFERENCES
// ============================================================

print("Field updates and associated incident IDs:");

printjson(
    db.field_updates.find(
        {},
        {
            worker_name: 1,
            incident_report_id: 1
        }
    ).toArray()
);

// ============================================================
// END OF MONGODB COMMANDS
// ============================================================
