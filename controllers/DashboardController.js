const UserModel = require('../models/User.js');

exports.getDashboard = async (req, res) => {
  let user;
  try {
    user = await UserModel.findById(req.session.userId);
  } catch (err) {
    return res.redirect('/login');
  }
  res.render('dashboard/index', { user: user });
};
