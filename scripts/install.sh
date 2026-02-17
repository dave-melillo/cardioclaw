#!/bin/bash
set -e

# CardioClaw Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/dave-melillo/cardioclaw/main/scripts/install.sh | bash

VERSION="0.2.0"
REPO="https://github.com/dave-melillo/cardioclaw"
INSTALL_DIR="$HOME/.cardioclaw"

echo ""
echo "🫀 CardioClaw Installer v${VERSION}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    echo "   https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ required. Found: $(node -v)"
    exit 1
fi
echo "✓ Node.js $(node -v)"

# Check for OpenClaw
if ! command -v openclaw &> /dev/null; then
    echo "❌ OpenClaw CLI not found."
    echo "   Install: https://docs.openclaw.ai"
    exit 1
fi
echo "✓ OpenClaw CLI found"

# Clone or update
if [ -d "$INSTALL_DIR/repo" ]; then
    echo ""
    echo "→ Updating existing installation..."
    cd "$INSTALL_DIR/repo"
    git pull --quiet
else
    echo ""
    echo "→ Cloning CardioClaw..."
    mkdir -p "$INSTALL_DIR"
    git clone --quiet "$REPO" "$INSTALL_DIR/repo"
    cd "$INSTALL_DIR/repo"
fi

# Install dependencies
echo "→ Installing dependencies..."
npm install --silent

# Link globally
echo "→ Linking CLI..."
npm link --silent 2>/dev/null || sudo npm link --silent

# Create default config if none exists
if [ ! -f "$INSTALL_DIR/cardioclaw.yaml" ]; then
    echo "→ Creating default config..."
    cat > "$INSTALL_DIR/cardioclaw.yaml" << 'EOF'
# CardioClaw Configuration
# Docs: https://github.com/dave-melillo/cardioclaw

heartbeats:
  # Example: Morning briefing
  # - name: Morning Briefing
  #   schedule: "0 8 * * *"
  #   prompt: "Run morning briefing: weather, calendar, inbox summary"
  #   delivery: telegram

  # Example: One-shot reminder
  # - name: Gym Reminder
  #   schedule: at 2026-02-15 18:00
  #   message: "Reminder: Gym time! 🏋️"
  #   sessionTarget: main
  #   delivery: telegram
EOF
fi

# Install OpenClaw skill for agent awareness
SKILL_DIR="$HOME/.openclaw/skills/cardioclaw"
echo "→ Installing OpenClaw skill..."
mkdir -p "$SKILL_DIR"
cp "$INSTALL_DIR/repo/skill/SKILL.md" "$SKILL_DIR/"
echo "✓ Skill installed — your agent now knows CardioClaw"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ CardioClaw installed!"
echo ""
echo "   CLI: cardioclaw (global)"
echo "   Config: ~/.cardioclaw/cardioclaw.yaml"
echo "   Skill: ~/.openclaw/skills/cardioclaw/"
echo ""
echo "Next steps:"
echo ""
echo "  1. Import existing jobs (if any):"
echo "     cardioclaw import"
echo ""
echo "  2. Or edit heartbeats manually:"
echo "     nano ~/.cardioclaw/cardioclaw.yaml"
echo ""
echo "  3. Sync to OpenClaw:"
echo "     cardioclaw sync"
echo ""
echo "  4. Check status:"
echo "     cardioclaw status"
echo ""
echo "  5. Launch dashboard:"
echo "     cardioclaw dashboard"
echo ""
echo "Your agent now knows CardioClaw! Just ask:"
echo "  \"Create a daily briefing at 8am\""
echo "  \"What heartbeats do I have?\""
echo ""
echo "Docs: https://github.com/dave-melillo/cardioclaw"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
