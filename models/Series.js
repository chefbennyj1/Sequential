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
    }]
}, { timestamps: true });

module.exports = mongoose.model('Series', seriesSchema);
