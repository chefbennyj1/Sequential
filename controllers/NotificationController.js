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

  async markRead(req, res) {
    try {
      const notification = await NotificationService.markRead(req.params.id, req.session.userId);
      if (!notification) {
        return res.status(404).json({ ok: false, message: 'Notification not found.' });
      }
      res.json({ ok: true, notification });
    } catch (err) {
      console.error('[NotificationController] Mark read failed:', err);
      res.status(500).json({ ok: false, message: err.message });
    }
  }

  async markAllRead(req, res) {
    try {
      await NotificationService.markAllRead(req.session.userId);
      res.json({ ok: true });
    } catch (err) {
      console.error('[NotificationController] Mark all read failed:', err);
      res.status(500).json({ ok: false, message: err.message });
    }
  }
}

module.exports = new NotificationController();
