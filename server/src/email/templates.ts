/*
 * Plain-text emails. No tracking pixels, no remote images, no link redirects.
 * Security emails cannot be turned off; marketing-style emails (product updates, weekly summary)
 * are opt-in, and carry a one-click unsubscribe link and List-Unsubscribe headers.
 */
export type EmailCategory = 'security' | 'product' | 'weekly';

export type EmailMessage =
  | { template: 'verify'; data: { link: string } }
  | { template: 'reset'; data: { link: string } }
  | { template: 'password-changed'; data: { at: string } }
  | { template: 'new-device'; data: { at: string; device: string } }
  | { template: 'account-deleted'; data: { at: string } }
  | { template: 'weekly'; data: { minutes: number; sessions: number; unsubscribe: string } };

export interface Rendered {
  subject: string;
  text: string;
  category: EmailCategory;
  unsubscribe?: string;
}

const SIGN_OFF = '\n\nStay focused. Stay panda.\nPandaro';
const SECURITY_NOTE =
  '\n\nThis is a security email about your Pandaro account. You get these even if other emails are turned off.';

export function render(message: EmailMessage): Rendered {
  switch (message.template) {
    case 'verify':
      return {
        category: 'security',
        subject: 'Confirm your email for Pandaro',
        text: `Please confirm your email address to finish setting up your Pandaro account:\n\n${message.data.link}\n\nThe link works for 24 hours. If you did not create an account, you can ignore this email.${SIGN_OFF}`,
      };
    case 'reset':
      return {
        category: 'security',
        subject: 'Reset your Pandaro password',
        text: `Someone asked to reset the password for your Pandaro account. If it was you, choose a new password here:\n\n${message.data.link}\n\nThe link works once, for 30 minutes. If it was not you, ignore this email: your password has not changed.${SECURITY_NOTE}${SIGN_OFF}`,
      };
    case 'password-changed':
      return {
        category: 'security',
        subject: 'Your Pandaro password was changed',
        text: `Your Pandaro password was changed on ${message.data.at}. All other devices have been signed out.\n\nIf you did not do this, reset your password straight away from the sign-in screen.${SECURITY_NOTE}${SIGN_OFF}`,
      };
    case 'new-device':
      return {
        category: 'security',
        subject: 'New sign-in to Pandaro',
        text: `Your Pandaro account was signed in on a new device (${message.data.device}) on ${message.data.at}.\n\nIf this was not you, change your password and sign out other devices from Settings → Account.${SECURITY_NOTE}${SIGN_OFF}`,
      };
    case 'account-deleted':
      return {
        category: 'security',
        subject: 'Your Pandaro account has been deleted',
        text: `Your Pandaro account and the data synced to it were deleted on ${message.data.at}. Data saved on your devices stays there until you remove the app or clear it.\n\nEncrypted backups that still contain your records can no longer be read, because your data key was deleted with the account. They expire within 35 days.${SIGN_OFF}`,
      };
    case 'weekly':
      return {
        category: 'weekly',
        subject: 'Your week with Pandaro',
        unsubscribe: message.data.unsubscribe,
        text: `This week you finished ${message.data.sessions} focus session${message.data.sessions === 1 ? '' : 's'} (${message.data.minutes} minutes). Nice work.${SIGN_OFF}\n\nYou asked for this weekly summary. Stop it with one click: ${message.data.unsubscribe}`,
      };
  }
}
