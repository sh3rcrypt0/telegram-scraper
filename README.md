# Telegram to Discord Forwarder

Forward Telegram group messages to Discord using webhooks. Supports attachments and allows for a wide configuration of filters for groups.

---

## Installation

1. **Clone the repository or download [telegram-scraper](https://github.com/sh3rcrypt0/telegram-scraper/archive/refs/heads/master.zip) zip file**
   ```bash
   git clone <repo-url>
   cd telegram-scraper-master
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

---

## Configuration

1. **Copy the sample config:**
   ```bash
   cp sample_config.json config.json
   ```
   > On Windows, use `copy sample_config.json config.json` in Command Prompt.

2. **Edit `config.json`**
   - Open `config.json` in your favorite editor.
   - Fill in the required fields:

     | Field                | Description                                                                 |
     |----------------------|-----------------------------------------------------------------------------|
     | `phone`              | Your Telegram phone number (with country code, e.g., `+1234567890`)         |
     | `api.id`             | Your Telegram API ID ([Get it here](https://my.telegram.org/apps))           |
     | `api.hash`           | Your Telegram API hash ([Get it here](https://my.telegram.org/apps))         |
     | `listeners`          | Array of listener objects (see below)                                        |

   - **Example:**
     ```json
     {
       "phone": "+1234567890",
       "debug": false,
       "api": {
         "id": 123456789,
         "hash": "your_api_hash"
       },
       "errors": {
         "catch": true,
         "webhook": "https://discord.com/api/webhooks/..."
       },
       ...
     }
     ```

3. **Configure Listeners**
   - Each listener defines a Telegram group/channel to monitor and a Discord webhook to forward messages to.
   - Example listener:
     ```json
     {
       "name": "Cielo-MAIN",
       "type": {"🟢": "buy", "🔴": "sell"},
       "group": "5347402666",
       "linked": false,
       "embedded": true,
       "allowDMs": true,
       "webhook": "https://discord.com/api/webhooks/..."
     }
     ```
   - **Listener fields:**
     - `name`: Name for this listener (for logs)
     - `type`: Type of messages to filter or object mapping emojis to types
     | `group`: Telegram group/channel ID (as string)
     | `webhook`: Discord webhook URL (required for forwarding)
     | `linked`, `embedded`, `allowDMs`, etc.: See `sample_config.json` for all options

---

## Usage

1. **Start the bot:**
   ```bash
   npm start
   ```
   or
   ```bash
   node dist/index.js
   ```

2. **First run:**
   - You will be prompted for your Telegram password and the login code sent to your phone.
   - A session file (`.keepsecret`) will be created for future logins.

3. **Bot operation:**
   - The bot will log in, list your groups/channels, and start forwarding messages as configured.
   - Errors (if enabled) will be sent to the Discord webhook specified in `errors.webhook`.

---

## Notes
- Make sure your Telegram account is active and can receive login codes.
- You must create your own Telegram API ID and hash at [my.telegram.org](https://my.telegram.org/apps).
- Discord webhooks can be created in your server settings under Integrations > Webhooks.
- For advanced filtering and options, see comments in `sample_config.json` and the `Listener` type in `typings/structs.d.ts`.

---

## Troubleshooting
- If you see `Cannot find module '../../config'`, make sure you have renamed `sample_config.json` to `config.json` in the project root.
- If you encounter login issues, double-check your phone number, API ID, and API hash.
- For dependency issues, try running `npm install` again.

---

## License
Unlicensed. See `package.json` for details. 
