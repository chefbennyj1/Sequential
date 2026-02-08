const UserModel = require('../models/User.js');
const bcrypt = require('bcryptjs');

async function createUser({ username, email, password, age }) {
    let user = await UserModel.findOne({ email });

    if (user) {
        return { ok: false, message: 'User already exists' };
    }

    const hashedPsw = await bcrypt.hash(password, 12);

    user = new UserModel({
        username,
        email,
        password: hashedPsw,
        age
    });

    await user.save();
    return { ok: true, user };
}

async function comparePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
}

module.exports = { createUser, comparePassword };