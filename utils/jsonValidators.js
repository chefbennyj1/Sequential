/**
 * Validates and normalizes Page Media data.
 * Enforces the structure: { media: [] }
 */
function validateMedia(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid media data: Must be an object.");
  }

  let normalized = { media: [] };

  if (Array.isArray(data.media)) {
    normalized.media = data.media.filter((item) => {
      if (!item.panel || !item.type || !item.fileName) return false;
      
      const allowedTypes = ["image", "video"];
      return allowedTypes.includes(item.type);
    });
  }

  return normalized;
}

module.exports = {
  validateMedia
};