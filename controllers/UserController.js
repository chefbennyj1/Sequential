const AuthService = require('../services/AuthService.js');
const UserService = require('../services/UserService.js');

exports.registerUser = async (req, res) => {
  const { username, email, password, age } = req.body;

  const result = await AuthService.createUser({ username, email, password, age });

  if (result.ok) {
    res.redirect('/login');
  } else {
    // TODO: handle user already exists error
    res.redirect('/login');
  }
};

exports.getUser = async (req, res) => {
  let email = req.session.user.email;
  let user = await UserService.getUserByEmail(email);
  if(!user) return res.status(401).json({ ok: false });
  // send only safe fields
  res.json({ ok: true, user: user });
};

exports.updateUser = async (req, res) => {
  const userId = req.session.user.id.toString();
  
  if (!userId) return res.status(404).json({ message: 'User not found' });

  const { email, currentPassword, newPassword } = req.body;
  
  const result = await UserService.updateUser(userId, email, currentPassword, newPassword);

  if (result.ok) {
    res.render('dashboard', { user: result.user });
  } else {
    res.status(result.status).json({ message: result.message });
  }
};
