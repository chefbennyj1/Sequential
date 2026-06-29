const path = require('path');
const AuthService = require('../services/AuthService.js');
const UserService = require('../services/UserService.js');

exports.registerUser = async (req, res) => {
  const { username, email, password, age } = req.body;
  const result = await AuthService.createUser({ username, email, password, age });
  res.redirect('/login');
};

exports.getUser = async (req, res) => {
  const email = req.session.user?.email;
  if (!email) return res.status(401).json({ ok: false });

  const user = await UserService.getUserByEmail(email);
  if (!user) return res.status(401).json({ ok: false });

  res.json({ ok: true, user });
};

exports.updateUser = async (req, res) => {
  const userId = req.session.user?.id?.toString();
  if (!userId) return res.status(401).json({ ok: false, message: 'Not authenticated.' });

  const { email, currentPassword, newPassword } = req.body;
  const result = await UserService.updateUser(userId, email, currentPassword, newPassword);

  if (result.ok) {
    if (email) req.session.user.email = email;
    return res.json({ ok: true, message: 'Account updated.' });
  }
  return res.status(result.status).json({ ok: false, message: result.message });
};

exports.uploadAvatar = async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, message: 'No file uploaded.' });

  const userId = req.session.userId?.toString();
  if (!userId) return res.status(401).json({ ok: false, message: 'Not authenticated.' });

  const ext = path.extname(req.file.originalname).toLowerCase();
  const avatarUrl = `/images/users/${userId}/avatar${ext}`;

  try {
    await UserService.updateUserAvatar(userId, avatarUrl);
    return res.json({ ok: true, avatarUrl });
  } catch (err) {
    console.error('[UserController] uploadAvatar error:', err);
    return res.status(500).json({ ok: false, message: 'Failed to save avatar.' });
  }
};
