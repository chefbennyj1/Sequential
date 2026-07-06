const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  source: {
    type: String, // Who produced it: a plugin name, "System", or later a co-writer
    default: 'System'
  },
  title: {
    type: String,
    required: true
  },
  body: {
    type: String,
    default: ''
  },
  // Optional deep link into the studio, e.g.
  // { series, seriesFolder, volume, chapter, pageId, targetId }
  link: {
    type: Object,
    default: null
  },
  read: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
