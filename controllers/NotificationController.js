const NotificationService = require('../services/NotificationService');

class NotificationController {
  async list(req, res) {
    try {
      const notifications = await NotificationService.listForUser(req.session.userId);
      res.json({ ok: true, notifications });
    } catch (err) {
      console.error('[NotificationController] List failed:', err);
      res.status(500).json({ ok: false, message: err.message });
    }
  }

  async create(req, res) {
    try {
      const { source, title, body, link } = req.body;
      if (!title) {
        return res.status(400).json({ ok: false, message: "Missing 'title'." });
      }
      const notification = await NotificationService.create({
        user: req.session.userId,
        source,
        title,
        body,
        link
      }, req.app.locals.io);
      res.json({ ok: true, notification });
    } catch (err) {
      console.error('[NotificationController] Create failed:', err);
      res.status(500).json({ ok: false, message: err.message });
    }
  }

  async remove(req, res) {
    try {
      const notification = await NotificationService.remove(req.params.id, req.session.userId);
      if (!notification) {
        return res.status(404).json({ ok: false, message: 'Notification not found.' });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[NotificationController] Remove failed:', err);
      res.status(500).json({ ok: false, message: err.message });
    }
  }

  async clearAll(req, res) {
    try {
      await NotificationService.clearAll(req.session.userId);
      res.json({ ok: true });
    } catch (err) {
      console.error('[NotificationController] Clear all failed:', err);
      res.status(500).json({ ok: false, message: err.message });
    }
  }
}

module.exports = new NotificationController();
