const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const libraryRootSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    path: {
        type: String, // Absolute path on the filesystem (e.g., E:\New Site\Library)
        required: true,
        unique: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model('LibraryRoot', libraryRootSchema);
