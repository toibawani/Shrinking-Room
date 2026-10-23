const { z } = require('zod');

function validate(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body || {});
      next();
    } catch (e) {
      next(e);
    }
  };
}

module.exports = { z, validate };
