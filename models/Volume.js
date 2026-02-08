const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const pageSchema = new Schema({
    index: Number,
    path: String, // e.g. "views/Volumes/volume-1/chapter-1/page0/page0.html"    
    layoutId: { type: String, default: "" }, // e.g. "layout-asymmetrical-2x2"
    mediaData: { type: Object, default: {} }, // Cache of consolidated media config
    sceneData: { type: Array, default: [] }   // Cache of consolidated scene cues
});

const chapterSchema = new Schema({
    title: String,
    chapterNumber: Number,
    pages: [pageSchema],
    backgroundAudioSrc: { type: String, default: null }, // Legacy chapter-specific field
    backgroundAudioVolume: { type: Number, default: 1.0 },
    backgroundAudioLoop: { type: Boolean, default: true },
    dualAudio: { type: Boolean, default: false }
});

const volumeSchema = new Schema({
  series: {
    type: Schema.Types.ObjectId,
    ref: 'Series'
  },
    index: Number,
    title: String,
    volumePath: String, // e.g. "/views/Volumes/volume-1/"
    audioMap: { type: Array, default: [] }, // Cache of audio_map.json

    chapters: [chapterSchema]
});

module.exports = mongoose.model('Volume', volumeSchema, 'Volumes');