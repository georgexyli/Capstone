# Quick Setup Guide - Spartan DeFi Bot

## ✅ Completed Steps
1. ✅ Dependencies installed (1174 packages)
2. ✅ `.env` file created

## 🔧 Next Steps (YOU DO THESE)

### Step 1: Add Your API Keys to `.env`

Open the `.env` file and add your keys:

```bash
# REQUIRED: Add at least ONE of these AI keys
OPENAI_API_KEY=sk-proj-xxxxx...    # Get from platform.openai.com
# OR
ANTHROPIC_API_KEY=sk-ant-xxxxx...  # Get from console.anthropic.com
```

**Get API Keys:**
- OpenAI: https://platform.openai.com/api-keys (requires payment)
- Anthropic: https://console.anthropic.com/ (free credits available)

### Step 2: Start MySQL Database

**Option A: Using Docker (Easiest)**
```bash
docker-compose up -d
```

**Option B: Using Docker manually**
```bash
docker run --name spartan-mysql \
  -e MYSQL_ROOT_PASSWORD=spartan_password_123 \
  -e MYSQL_DATABASE=spartan \
  -p 3307:3306 \
  -d mysql:9.1.0
```

**Option C: Use existing MySQL**
If you have MySQL already running, just update these in `.env`:
```env
MYSQL_HOST=localhost
MYSQL_PORT=3306  # Your MySQL port
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=spartan  # Create this database
```

### Step 3: Run the Bot

```bash
# Development mode (auto-reload on changes)
bun run dev

# OR Production mode
bun run start
```

## 🎯 What You Can Do After It Starts

The bot will run with:
- ✅ Basic Spartan agent personality
- ✅ OpenAI/Anthropic AI capabilities
- ✅ Solana blockchain integration
- ✅ Discord/Telegram support (if you add bot tokens)

**Currently Functional Features:**
- Talk to the AI agent
- Basic knowledge responses
- Solana wallet management (if you add Solana wallet keys)

**NOT Working Yet (Your Project Work):**
- ❌ Ethereum/Sepolia integration
- ❌ Uniswap swaps
- ❌ Pre-execution simulation
- ❌ Human confirmation gates
- ❌ Multi-wallet management features

## 🐛 Troubleshooting

### "Database connection failed"
- Make sure MySQL is running: `docker ps` (should see mysql container)
- Check credentials in `.env` match your database

### "Missing API key"
- You MUST add either `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`
- Get them from the links in Step 1

### "Command not found: bun"
Use npm instead:
```bash
npm run dev
```

## 📝 Important Notes

⚠️ **This is currently a SOLANA trading bot, not Ethereum!**
- Your project goal is to migrate it to Ethereum/Sepolia
- Once you get this running and see how it works, we'll start building the Ethereum layer

⚠️ **No trading features will work without:**
- Solana wallet keys (SOLANA_PUBLIC_KEY, SOLANA_PRIVATE_KEY)
- Birdeye API key (for market data)
- Jupiter integration (commented out due to npm availability)

## 🎓 Next Phase (After You Get It Running)

Once the bot is running, we'll work on:
1. Understanding the current Solana swap flow
2. Building the Ethereum/Uniswap equivalent
3. Adding Sepolia testnet integration
4. Implementing pre-execution simulation
5. Adding human confirmation gates

---

**Ready to proceed?**
1. Add your OpenAI or Anthropic API key to `.env`
2. Start MySQL: `docker-compose up -d`
3. Run the bot: `bun run dev`
