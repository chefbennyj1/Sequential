const mongoose = require('mongoose');

const characterSchema = new mongoose.Schema({
  series: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Series',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  color: {
    type: String, // Hex code or CSS color string (e.g., "#00ccff")
    default: '#ffffff'
  },
  voiceId: {
    type: String, // ElevenLabs Voice ID or similar
    default: null
  },
  description: {
    type: String,
    default: ''
  },
  image: {
    type: String, // Path to avatar image
    default: ''
  },
  referenceImages: {
    type: [String], // Array of paths to reference images
    default: []
  },
  // Default visual styles for SpeechBubbles
  defaultStyle: {
    type: Object, // e.g., { "color": "#00ccff", "fontFamily": "Orbitron" }
    default: {}
  },
  // Default HTML attributes for SpeechBubbles
  defaultAttributes: {
    type: Object, // e.g., { "class": "cyber-bubble nova-style" }
    default: {}
  }
}, { timestamps: true });

module.exports = mongoose.model('Character', characterSchema);
