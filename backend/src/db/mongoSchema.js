// Database-level validation for the two MongoDB collections, plus their indexes.
// Applied at server start (safe to run every time). MongoDB then rejects any insert
// or update that breaks these rules, no matter which program sends it.

const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const anyInt = ['int', 'long', 'double']; // JS numbers may be stored as int32 or double

const incidentValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['title', 'disaster_type', 'severity', 'location', 'description', 'reported_by', 'created_at'],
    properties: {
      title: { bsonType: 'string', minLength: 3, maxLength: 200 },
      disaster_type: { bsonType: 'string', minLength: 2, maxLength: 50 },
      severity: { enum: SEVERITIES },
      location: {
        bsonType: 'object',
        required: ['type', 'coordinates'],
        properties: {
          type: { enum: ['Point'] },
          // GeoJSON order is [longitude, latitude]
          coordinates: {
            bsonType: 'array',
            minItems: 2,
            maxItems: 2,
            items: [
              { bsonType: 'number', minimum: -180, maximum: 180 },
              { bsonType: 'number', minimum: -90, maximum: 90 },
            ],
          },
        },
      },
      description: { bsonType: 'string', minLength: 1, maxLength: 5000 },
      // Ids of rows in the MySQL `request` table (the API checks they exist)
      related_request_ids: { bsonType: 'array', maxItems: 100, uniqueItems: true, items: { bsonType: anyInt, minimum: 1 } },
      reported_by: { bsonType: 'string', minLength: 1, maxLength: 100 },
      reported_by_user_id: { bsonType: anyInt, minimum: 1 },
      created_at: { bsonType: 'date' },
      updated_at: { bsonType: 'date' },
    },
  },
};

const fieldUpdateValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['incident_report_id', 'worker_name', 'situation', 'created_at'],
    properties: {
      incident_report_id: { bsonType: 'objectId' },
      worker_name: { bsonType: 'string', minLength: 1, maxLength: 100 },
      worker_user_id: { bsonType: anyInt, minimum: 1 },
      situation: { bsonType: 'string', minLength: 1, maxLength: 2000 },
      damage_observed: { bsonType: 'string', maxLength: 2000 },
      additional_requirements: {
        bsonType: 'array',
        maxItems: 20,
        items: { bsonType: 'string', minLength: 1, maxLength: 50 },
      },
      created_at: { bsonType: 'date' },
    },
  },
};

// "moderate": documents that already exist and break a rule are left alone,
// but every new insert and every update to a valid document is checked.
async function applyValidator(db, name, validator) {
  const options = { validator, validationLevel: 'moderate', validationAction: 'error' };
  const exists = (await db.listCollections({ name }).toArray()).length > 0;
  if (exists) await db.command({ collMod: name, ...options });
  else await db.createCollection(name, options);
}

async function ensureMongoSchema(db) {
  await applyValidator(db, 'incident_reports', incidentValidator);
  await applyValidator(db, 'field_updates', fieldUpdateValidator);

  await db.collection('incident_reports').createIndex({ location: '2dsphere' }); // $geoNear
  await db.collection('incident_reports').createIndex({ severity: 1, created_at: -1 });
  await db.collection('incident_reports').createIndex({ related_request_ids: 1 });
  await db.collection('field_updates').createIndex({ incident_report_id: 1, created_at: -1 });
}

module.exports = { ensureMongoSchema, incidentValidator, fieldUpdateValidator, SEVERITIES };
