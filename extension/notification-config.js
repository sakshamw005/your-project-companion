/**
 * Notification Configuration and Manager
 * Handles notification preferences and settings for GuardianLink
 */

class NotificationManager {
  constructor() {
    this.defaultSettings = {
      enableNotifications: true,
      notifyOnBlock: true,
      notifyOnWarn: true,
      notifyOnAllow: false,
      notifyOnStartup: true,
      notifyOnManualScan: true,
      notificationDuration: 'short', // short, medium, long
      soundEnabled: false,
      requireInteraction: {
        block: true,
        warn: false,
        allow: false
      }
    };
  }

  /**
   * Initialize notification settings
   */
  async initialize() {
    try {
      const result = await browser.storage.local.get('guardianlink_notification_settings');
      if (!result.guardianlink_notification_settings) {
        await browser.storage.local.set({
          guardianlink_notification_settings: this.defaultSettings
        });
        console.log('✅ Notification settings initialized with defaults');
      }
    } catch (error) {
      console.error('❌ Failed to initialize notification settings:', error);
    }
  }

  /**
   * Get notification settings
   */
  async getSettings() {
    try {
      const result = await browser.storage.local.get('guardianlink_notification_settings');
      return result.guardianlink_notification_settings || this.defaultSettings;
    } catch (error) {
      console.error('❌ Failed to get notification settings:', error);
      return this.defaultSettings;
    }
  }

  /**
   * Update notification settings
   */
  async updateSettings(newSettings) {
    try {
      const currentSettings = await this.getSettings();
      const updatedSettings = { ...currentSettings, ...newSettings };
      await browser.storage.local.set({
        guardianlink_notification_settings: updatedSettings
      });
      console.log('✅ Notification settings updated:', newSettings);
      return updatedSettings;
    } catch (error) {
      console.error('❌ Failed to update notification settings:', error);
    }
  }

  /**
   * Check if notifications are enabled for a verdict
   */
  async shouldNotify(verdict) {
    const settings = await this.getSettings();
    
    if (!settings.enableNotifications) return false;
    
    switch (verdict.toUpperCase()) {
      case 'BLOCK':
        return settings.notifyOnBlock;
      case 'WARN':
        return settings.notifyOnWarn;
      case 'ALLOW':
        return settings.notifyOnAllow;
      default:
        return false;
    }
  }

  /**
   * Get notification options based on verdict
   */
  async getNotificationOptions(verdict) {
    const settings = await this.getSettings();
    const options = {
      iconUrl: browser.runtime.getURL('assets/icon-128.png'),
      requireInteraction: false
    };

    // Set require interaction based on verdict
    const verdictKey = verdict.toLowerCase();
    if (settings.requireInteraction[verdictKey]) {
      options.requireInteraction = true;
    }

    return options;
  }

  /**
   * Reset settings to defaults
   */
  async resetToDefaults() {
    try {
      await browser.storage.local.set({
        guardianlink_notification_settings: this.defaultSettings
      });
      console.log('✅ Notification settings reset to defaults');
      return this.defaultSettings;
    } catch (error) {
      console.error('❌ Failed to reset notification settings:', error);
    }
  }
}

// Create global instance
const notificationManager = new NotificationManager();
