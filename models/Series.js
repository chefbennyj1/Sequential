const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const seriesSchema = new Schema({
    title: {
        type: String,
        required: true
    },
    folderName: {
        type: String,
        required: true,
        unique: true
    },
    libraryRoot: {
        type: Schema.Types.ObjectId,
        ref: 'LibraryRoot',
        default: null
    },
    sourcePath: {
        type: String, // Optional absolute path override
        default: ""
    },
    description: {
        type: String,
        default: ""
    },
    coverImage: {
        type: String, // Path to cover image
        default: ""
    },
    volumes: [{
        type: Schema.Types.ObjectId,
        ref: 'Volume'
    }],
    settings: {
        bubbleFontSize: { type: String, default: "0.8rem" },
        textBlockFontSize: { type: String, default: "0.8em" },
        actionTextFontSize: { type: String, default: "2.5rem" },
        primaryFontFamily: { type: String, default: "" },
        customCssFiles: [{ type: String }]
    }
}, { timestamps: true });

module.exports = mongoose.model('Series', seriesSchema);
