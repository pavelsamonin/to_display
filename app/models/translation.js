'use strict';
const mongoose = require('mongoose'),
    Schema = mongoose.Schema;

const LanguageSchema = new Schema({
    name: {
        type: String,
        intl: true
    },
    value: {
        type: Schema.Types.Mixed
    }
});

module.exports = mongoose.model('Language', LanguageSchema);