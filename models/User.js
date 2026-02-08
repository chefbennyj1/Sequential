const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
    username : {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    password : {
        type: String,
        required: true
    },
    age: {
        type: Number,
        min: 18,
        validate: {
            validator: v => v >= 18,
            message: "You must be 18 or older to access this site", //"${props.value}"
        }
    },
    administrator: {
        type: Boolean,
        default: false
    }
},
{
    timestamps: true  
});

module.exports = mongoose.model("User", userSchema);