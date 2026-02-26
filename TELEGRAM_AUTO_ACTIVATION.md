# Foreman Telegram Auto-Activation

## Feature
When you set the `FOREMAN_TELEGRAM_TOKEN` environment variable, running `foreman` without any arguments will automatically start the Telegram messaging gateway instead of the REPL.

## Usage

### 1. Set your Telegram bot token
```bash
export FOREMAN_TELEGRAM_TOKEN="your_bot_token_here"
```

Or add to your `.bashrc`, `.zshrc`, or `.env` file:
```bash
FOREMAN_TELEGRAM_TOKEN=your_bot_token_here
```

### 2. Run foreman
```bash
foreman
```

Instead of starting the interactive REPL, Foreman will now:
- Detect the Telegram token automatically
- Start the messaging gateway
- Connect to Telegram and begin listening for messages
- Show live status: active channels, conversation count, etc.

### 3. Test it
Send a message to your Telegram bot, and Foreman will respond!

## How It Works
- The default `foreman` command now checks for `process.env.FOREMAN_TELEGRAM_TOKEN`
- If found, it starts `MessagingGateway` with Telegram channel configured
- If not found, it falls back to the interactive REPL (original behavior)
- This requires no changes to existing `foreman serve` functionality

## Benefits
- **Faster startup**: Just type `foreman` instead of `foreman serve --telegram $TOKEN`
- **Environment-based**: Works seamlessly with Docker, systemd, dotenv files
- **Backward compatible**: Existing behavior unchanged when token is not set
- **Production-friendly**: Perfect for deployments where you want Telegram always on

## Example systemd service
```ini
[Unit]
Description=Foreman with Telegram
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/projects/foreman
Environment=FOREMAN_TELEGRAM_TOKEN=your_bot_token_here
ExecStart=/usr/local/bin/foreman
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```