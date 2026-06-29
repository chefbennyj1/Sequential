const mongoose = require('mongoose');

const accountRequestSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email:    { type: String, required: true },
    password: { type: String, required: true },
    status:   { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' }
}, { timestamps: true });

module.exports = mongoose.model('AccountRequest', accountRequestSchema);
