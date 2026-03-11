#!/usr/bin/env bash
# Runs after every Claude response (Stop event).
# Formats changed files, runs affected tests, shows Windows toast notification.
set -euo pipefail

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "/c/Users/pilot/Desktop/lmsplusv2")"
cd "$PROJECT_ROOT"

# 1. Format any staged or recently changed files with Biome
if command -v pnpm &>/dev/null && [ -f biome.json ]; then
  # Get files changed in last 60 seconds (recently written by Claude)
  CHANGED=$(find . -newer biome.json -name "*.ts" -o -name "*.tsx" -o -name "*.js" \
    | grep -v node_modules | grep -v .next | grep -v .turbo | head -20 || true)
  if [ -n "$CHANGED" ]; then
    echo "$CHANGED" | xargs pnpm biome format --write 2>/dev/null || true
  fi
fi

# 2. Run tests — show output on failure so issues are visible
if command -v pnpm &>/dev/null && [ -f package.json ]; then
  pnpm test 2>&1 || {
    echo "⚠ Tests failed after last response — check output above"
  }
fi

# 3. Windows toast notification
powershell.exe -NonInteractive -NoProfile -Command "
  \$xml = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
  \$template = [Windows.UI.Notifications.ToastTemplateType]::ToastText01
  \$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(\$template)
  \$xml.GetElementsByTagName('text')[0].AppendChild(\$xml.CreateTextNode('Claude finished')) | Out-Null
  \$toast = [Windows.UI.Notifications.ToastNotification]::new(\$xml)
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude Code').Show(\$toast)
" 2>/dev/null || true

exit 0
