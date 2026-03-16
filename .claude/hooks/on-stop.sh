#!/usr/bin/env bash
# Runs after every Claude response (Stop event).
# Shows Windows toast notification. Formatting and tests are handled by Lefthook pre-commit.
set -euo pipefail

# Windows toast notification
powershell.exe -NonInteractive -NoProfile -Command "
  \$xml = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
  \$template = [Windows.UI.Notifications.ToastTemplateType]::ToastText01
  \$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(\$template)
  \$xml.GetElementsByTagName('text')[0].AppendChild(\$xml.CreateTextNode('Claude finished')) | Out-Null
  \$toast = [Windows.UI.Notifications.ToastNotification]::new(\$xml)
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude Code').Show(\$toast)
" 2>/dev/null || true

exit 0
