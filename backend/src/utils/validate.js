const { ObjectId } = require('mongodb');
const HttpError = require('./httpError');

const bad = (message) => new HttpError(400, message);

// "12" -> 12. Used for URL params and numeric query params.
function parseId(value, name = 'id') {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(n) || n < 1) throw bad(`${name} must be a positive integer`);
  return n;
}

// "65f1c0..." (24 hex chars) -> ObjectId. Rejects anything else, including 12-char strings
// that the driver would otherwise accept.
function parseObjectId(value, name = 'id') {
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{24}$/.test(value)) {
    throw bad(`${name} must be a valid id`);
  }
  return new ObjectId(value);
}

// Optional numeric query param ("12.97") with a range. Returns undefined when absent.
function queryNumber(value, name, { min, max, required = false } = {}) {
  if (value === undefined) {
    if (required) throw bad(`${name} is required`);
    return undefined;
  }
  const n = typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
  if (!Number.isFinite(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
    throw bad(`${name} must be a number between ${min} and ${max}`);
  }
  return n;
}

// Optional query-string filters. Return undefined when the param is absent.
function queryEnum(value, name, allowed) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw bad(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

function queryText(value, name, max = 100) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > max) {
    throw bad(`${name} must be text up to ${max} characters`);
  }
  const text = value.trim();
  return text === '' ? undefined : text;
}

// Escapes regex special characters so user text is matched literally in a Mongo $regex.
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Escapes % and _ so user text in a LIKE search is matched literally.
function escapeLike(text) {
  return text.replace(/[\\%_]/g, '\\$&');
}

function checkValue(key, value, rule) {
  switch (rule.type) {
    case 'int':
      if (typeof value !== 'number' || !Number.isInteger(value)) throw bad(`${key} must be an integer`);
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) throw bad(`${key} must be a number`);
      break;
    case 'enum':
      if (!rule.values.includes(value)) throw bad(`${key} must be one of: ${rule.values.join(', ')}`);
      return value;
    case 'intArray': {
      if (!Array.isArray(value)) throw bad(`${key} must be an array of positive integers`);
      if (rule.maxItems && value.length > rule.maxItems) throw bad(`${key} can have at most ${rule.maxItems} items`);
      if (!value.every((n) => Number.isInteger(n) && n >= 1)) throw bad(`${key} must contain only positive integers`);
      return [...new Set(value)];
    }
    case 'stringArray': {
      if (!Array.isArray(value)) throw bad(`${key} must be an array of strings`);
      if (rule.maxItems && value.length > rule.maxItems) throw bad(`${key} can have at most ${rule.maxItems} items`);
      const items = value.map((v) => {
        if (typeof v !== 'string' || v.trim() === '') throw bad(`${key} must contain only non-empty strings`);
        if (rule.maxLength && v.trim().length > rule.maxLength) throw bad(`${key} items must be at most ${rule.maxLength} characters`);
        return v.trim();
      });
      return [...new Set(items)];
    }
    case 'string': {
      if (typeof value !== 'string') throw bad(`${key} must be a string`);
      let text = value.trim();
      if (rule.lowercase) text = text.toLowerCase();
      if (text === '') {
        if (rule.nullable) return null;
        throw bad(`${key} cannot be empty`);
      }
      if (rule.minLength && text.length < rule.minLength) throw bad(`${key} must be at least ${rule.minLength} characters`);
      if (rule.max && text.length > rule.max) throw bad(`${key} must be at most ${rule.max} characters`);
      return text;
    }
    default:
      throw new Error(`Unknown rule type for ${key}`);
  }
  if (rule.min !== undefined && value < rule.min) throw bad(`${key} must be at least ${rule.min}`);
  if (rule.max !== undefined && value > rule.max) throw bad(`${key} must be at most ${rule.max}`);
  return value;
}

// Validates a JSON body against a schema like:
//   { quantity: { type: 'int', min: 1, required: true }, note: { type: 'string', max: 200, nullable: true } }
// Only fields that exist in the schema are returned, so the result is safe to use
// for building column lists. partial=true is for PATCH (nothing required, but at
// least one field must be present).
function validateBody(body, schema, { partial = false } = {}) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw bad('Request body must be a JSON object');
  }

  const unknown = Object.keys(body).filter((key) => !Object.hasOwn(schema, key));
  if (unknown.length > 0) throw bad(`Unknown field(s): ${unknown.join(', ')}`);

  const out = {};
  for (const [key, rule] of Object.entries(schema)) {
    const value = body[key];
    if (value === undefined) {
      if (rule.required && !partial) throw bad(`${key} is required`);
      continue;
    }
    if (value === null) {
      if (!rule.nullable) throw bad(`${key} cannot be null`);
      out[key] = null;
      continue;
    }
    out[key] = checkValue(key, value, rule);
  }

  if (partial && Object.keys(out).length === 0) throw bad('No valid fields to update');
  return out;
}

module.exports = { parseId, parseObjectId, queryEnum, queryText, queryNumber, escapeLike, escapeRegex, validateBody };
