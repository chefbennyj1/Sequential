const { v4: uuidv4 } = require("uuid");

/**
 * Validates and normalizes media.json data.
 * Enforces the structure: { media: [], ambientAudio: {} }
 *
 * @param {any} data - The input JSON data.
 * @returns {object} - The valid, normalized data.
 * @throws {Error} - If validation fails.
 */
function validateMediaJson(data) {
  let normalized = { media: [], ambientAudio: {} };

  // Handle Array vs Object wrapper
  if (Array.isArray(data)) {
    normalized.media = data;
  } else if (typeof data === "object" && data !== null) {
    if (data.media && Array.isArray(data.media)) {
      normalized.media = data.media;
    }
    if (data.ambientAudio && typeof data.ambientAudio === "object") {
      normalized.ambientAudio = data.ambientAudio;
    }
  } else {
    throw new Error("Invalid media.json format: Must be an object or array.");
  }

  // Validate Media Items
  normalized.media = normalized.media.map((item, index) => {
    if (!item.panel || typeof item.panel !== "string") {
      throw new Error(`Media item at index ${index} missing required 'panel' (string).`);
    }
    if (!item.fileName || typeof item.fileName !== "string") {
      throw new Error(`Media item at index ${index} missing required 'fileName' (string).`);
    }
    
    // Allowed types: image, video, audio. 
    // Note: 'audio' might be used in rare cases inside media[]? 
    // EditorController.js uploadAsset allows 'audio' type, so we allow it.
    const allowedTypes = ["image", "video", "audio"];
    if (item.type && !allowedTypes.includes(item.type)) {
      throw new Error(`Media item at index ${index} has invalid type '${item.type}'. Allowed: ${allowedTypes.join(", ")}`);
    }

    return item;
  });

  // Validate Ambient Audio
  if (normalized.ambientAudio.fileName && typeof normalized.ambientAudio.fileName !== "string") {
      throw new Error("Invalid ambientAudio: 'fileName' must be a string.");
  }
  if (normalized.ambientAudio.volume !== undefined) {
      const v = Number(normalized.ambientAudio.volume);
      if (isNaN(v) || v < 0 || v > 1) {
          throw new Error("Invalid ambientAudio: 'volume' must be a number between 0 and 1.");
      }
      normalized.ambientAudio.volume = v;
  }

  return normalized;
}

/**
 * Validates and normalizes scene.json data.
 * Enforces the structure: { metadata: {}, scene: [] }
 *
 * @param {any} data - The input JSON data.
 * @returns {object} - The valid, normalized data.
 * @throws {Error} - If validation fails.
 */
function validateSceneJson(data) {
  let normalized = { metadata: {}, scene: [] };

  if (Array.isArray(data)) {
    normalized.scene = data;
  } else if (typeof data === "object" && data !== null) {
    if (data.scene && Array.isArray(data.scene)) {
      normalized.scene = data.scene;
    } else if (data.scene === undefined) {
        // Allow empty scene if object is valid structure but has no scene key yet? 
        // Or assume it's just metadata? Let's default to empty array.
        normalized.scene = [];
    }
    if (data.metadata && typeof data.metadata === "object") {
      normalized.metadata = data.metadata;
    }
  } else {
    throw new Error("Invalid scene.json format: Must be an object or array.");
  }

  // Validate Scene Cues
  normalized.scene = normalized.scene.map((cue, index) => {
    // Ensure ID
    if (!cue.id) {
        cue.id = uuidv4();
    }

    // Required Fields for a functional cue (though some might be optional in draft)
    // We'll be lenient but check types if present.

    if (cue.text && typeof cue.text !== "string") {
         throw new Error(`Cue at index ${index} has invalid 'text' (must be string).`);
    }

    if (cue.displayType) {
        if (typeof cue.displayType !== 'object') {
            throw new Error(`Cue at index ${index}: 'displayType' must be an object.`);
        }
        const validTypes = ["SpeechBubble", "TextBlock", "Pause", "SoundEffect", "Playlist"];
        if (cue.displayType.type && !validTypes.includes(cue.displayType.type)) {
             throw new Error(`Cue at index ${index}: Invalid displayType.type '${cue.displayType.type}'.`);
        }
    }

    if (cue.placement) {
         if (typeof cue.placement !== 'object') {
             throw new Error(`Cue at index ${index}: 'placement' must be an object.`);
         }
         // Optional: Check percentage strings if we want to be strict.
    }

    if (cue.mediaAction) {
        if (!Array.isArray(cue.mediaAction)) {
            throw new Error(`Cue at index ${index}: 'mediaAction' must be an array.`);
        }
        cue.mediaAction.forEach((action, mIdx) => {
            if (!action.type || !['video', 'image', 'Playlist'].includes(action.type)) {
                 // Warning: 'Playlist' was seen in sample? Or 'playlist'? 
                 // Context: "mediaAction": [{ "type": "video", ... }]
                 // Let's allow generic string types for now but ensure it exists.
                 if (!action.type) throw new Error(`Cue ${index} mediaAction ${mIdx} missing type.`);
            }
            if (action.action && !['load', 'play', 'pause', 'stop'].includes(action.action)) {
                 // warning or error?
            }
        });
    }

    return cue;
  });

  return normalized;
}

/**
 * Validates audio_map.json data.
 * Enforces structure: Array of { fileName, pages: [], volume }
 *
 * @param {any} data - The input JSON data.
 * @returns {Array} - The valid data array.
 * @throws {Error} - If validation fails.
 */
function validateAudioMap(data) {
  if (!Array.isArray(data)) {
    throw new Error("Invalid audio_map.json: Must be an array.");
  }

  return data.map((item, index) => {
    if (!item.fileName || typeof item.fileName !== "string") {
      throw new Error(`Audio map item at index ${index} missing 'fileName' (string).`);
    }
    
    if (!item.pages || !Array.isArray(item.pages)) {
      throw new Error(`Audio map item at index ${index} missing 'pages' (array).`);
    }

    if (item.volume !== undefined) {
        const v = Number(item.volume);
        if (isNaN(v) || v < 0 || v > 1) {
             throw new Error(`Audio map item at index ${index} has invalid volume.`);
        }
        item.volume = v; // Ensure number
    } else {
        item.volume = 1.0; // Default
    }

    return item;
  });
}

module.exports = {
  validateMediaJson,
  validateSceneJson,
  validateAudioMap
};
