const express = require('express');
const { getMongoDb } = require('../db/mongo');
const HttpError = require('../utils/httpError');
const { requireAuth } = require('../middleware/auth');
const { parseObjectId, queryText, escapeRegex } = require('../utils/validate');
const { parsePagination, paginated } = require('../utils/query');
const { toApi } = require('../utils/mongo');

const router = express.Router();
router.use(requireAuth);

const fieldUpdates = () => getMongoDb().collection('field_updates');

// GET /api/field-updates/requirements?limit=10
// What relief workers ask for most: unwinds every update's additional_requirements
// array, groups the same item together (case-insensitive) and counts mentions.
router.get('/requirements', async (req, res) => {
  const { limit } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 50 });
  const rows = await fieldUpdates()
    .aggregate([
      { $unwind: '$additional_requirements' },
      {
        $group: {
          _id: { $toLower: '$additional_requirements' },
          mentions: { $sum: 1 },
          incidents: { $addToSet: '$incident_report_id' },
        },
      },
      { $project: { _id: 0, requirement: '$_id', mentions: 1, incidents: { $size: '$incidents' } } },
      { $sort: { mentions: -1, requirement: 1 } },
      { $limit: limit },
    ])
    .toArray();
  res.json({ data: rows });
});

// GET /api/field-updates?requirement=&incident_id=&worker=&page=&limit=
router.get('/', async (req, res) => {
  const requirement = queryText(req.query.requirement, 'requirement', 50);
  const worker = queryText(req.query.worker, 'worker', 100);
  const paging = parsePagination(req.query);

  const filter = {};
  // On an array field, $regex matches if any element matches.
  if (requirement) filter.additional_requirements = { $regex: `^${escapeRegex(requirement)}$`, $options: 'i' };
  if (worker) filter.worker_name = worker;
  if (req.query.incident_id !== undefined) filter.incident_report_id = parseObjectId(req.query.incident_id, 'incident_id');

  const [rows, total] = await Promise.all([
    fieldUpdates().find(filter).sort({ created_at: -1, _id: -1 }).skip(paging.offset).limit(paging.limit).toArray(),
    fieldUpdates().countDocuments(filter),
  ]);
  res.json(paginated(rows.map(toApi), total, paging));
});

// GET /api/field-updates/:id
router.get('/:id', async (req, res) => {
  const doc = await fieldUpdates().findOne({ _id: parseObjectId(req.params.id) });
  if (!doc) throw new HttpError(404, 'Field update not found');
  res.json({ field_update: toApi(doc) });
});

module.exports = router;
