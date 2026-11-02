// Shapes a Mongo document for the API: _id becomes "id", ObjectId references become
// strings, and GeoJSON [lng, lat] also gets plain latitude/longitude for the frontend.
function toApi(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  const out = { id: _id.toString(), ...rest };
  if (out.incident_report_id) out.incident_report_id = out.incident_report_id.toString();
  const coords = out.location && out.location.coordinates;
  if (coords) {
    out.longitude = coords[0];
    out.latitude = coords[1];
  }
  return out;
}

module.exports = { toApi };
