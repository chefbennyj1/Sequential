const Notification = require('../models/Notification');

class NotificationService {
  async listForUser(userId, limit = 50) {
    return await Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async create(data, io = null) {
    // Collapse repeats: an unread notification from the same source about the
    // same page is updated in place instead of stacking up in the bell
    let notification = null;
    if (data.link && data.link.pageId) {
      notification = await Notification.findOneAndUpdate(
        { user: data.user, source: data.source, read: false, 'link.pageId': data.link.pageId },
        { title: data.title, body: data.body, link: data.link },
        { new: true, timestamps: true }
      );
    }
    if (!notification) {
      notification = await new Notification(data).save();
    }
    // Broadcast for the live bell dot; clients filter by their own user id
    if (io) io.emit('notification', notification);
    return notification;
  }

  async remove(id, userId) {
    return await Notification.findOneAndDelete({ _id: id, user: userId });
  }

  async clearAll(userId) {
    return await Notification.deleteMany({ user: userId });
  }
}

module.exports = new NotificationService();
