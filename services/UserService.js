const UserModel = require('../models/User.js');
const bcrypt = require('bcryptjs');

async function getUserByEmail(email) {
    return await UserModel.findOne({ email });
}

async function updateUser(userId, email, currentPassword, newPassword) {
    try {
        const user = await UserModel.findById(userId);

        if (!user) {
            return { ok: false, status: 404, message: 'User not found' };
        }

        const passwordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!passwordMatch) {
            return { ok: false, status: 403, message: 'Current password is incorrect' };
        }

        if (email !== user.email) {
            const existing = await UserModel.findOne({ email });
            if (existing) {
                return { ok: false, status: 409, message: 'Email already in use' };
            }
            user.email = email;
        }

        if (newPassword && newPassword.length) {
            user.password = await bcrypt.hash(newPassword, 12);
        }

        await user.save();
        return { ok: true, user };

    } catch (err) {
        console.error(err);
        return { ok: false, status: 500, message: 'Error updating account.' };
    }
}

module.exports = { getUserByEmail, updateUser };