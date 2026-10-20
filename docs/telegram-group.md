# Telegram group notifications

1. Apply the database migrations, including `0009_telegram_group.sql`.
2. Link the platform owner's or a staff member's Telegram account from the student app.
3. Add the bot as a group administrator and allow it to invite users.
4. From inside the target group, send `/setgroup`. The command is accepted only from a linked platform owner or staff member who is also a group administrator.
5. In a private chat with the bot, send `/admin`, then reply to its prompt with up to 25 Egyptian student phone numbers, one per line or separated by commas.

The bot looks up the numbers in student profiles. It cannot add Telegram users directly by phone number through the Bot API; for each matched student who has linked Telegram, it creates a single-use invite link and sends it privately. The student must open the link to join. Once the group is configured, a student who links Telegram from the app also receives a one-time group invite automatically (unless they are already a member).

For phone numbers that are not registered in the platform, the bot returns a separate group invite link for the administrator to forward. Since there is no student profile or Telegram chat to message, the administrator must share that link with them. It expires after 48 hours and can be used by multiple recipients.

Announcements and academic notifications are broadcast to the configured group. Individual account updates are sent only to the affected student and are never posted in the group.
