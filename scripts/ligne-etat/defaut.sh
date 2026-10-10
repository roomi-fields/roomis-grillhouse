#!/bin/bash
# The default left part of the Grillhouse status line, for a person without a status line command
# of their own: the model, the context used, the OpenRouter credit (cache 30 s) or the Anthropic
# rate limits over 5 h and 7 days. Reads Claude Code's status line input on stdin.

input=$(cat)

model=$(echo "$input" | jq -r '.model.display_name // "?"')
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
five_hour=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
five_reset=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')
seven_day=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
seven_reset=$(echo "$input" | jq -r '.rate_limits.seven_day.resets_at // empty')

# --- Model ---
printf "\033[1;36m%s\033[0m" "$model"

# --- Context ---
if [ -n "$used_pct" ]; then
  ctx_int=$(printf '%.0f' "$used_pct")
  if [ "$ctx_int" -ge 80 ]; then
    c="\033[1;31m"
  elif [ "$ctx_int" -ge 60 ]; then
    c="\033[1;33m"
  else
    c="\033[1;32m"
  fi
  printf "  |  ctx: ${c}%s%%\033[0m" "$ctx_int"
fi

# --- OpenRouter: crédit restant (cache 30s) ---
if [ "${ANTHROPIC_BASE_URL:-}" = "https://openrouter.ai/api" ]; then
  CACHE="/tmp/claude-or-credit.json"
  NOW=$(date +%s)
  if [ ! -f "$CACHE" ] || [ $(( NOW - $(jq -r '.ts // 0' "$CACHE" 2>/dev/null || echo 0) )) -ge 30 ]; then
    KEY="${ANTHROPIC_AUTH_TOKEN:-}"
    if [ -n "$KEY" ]; then
      DATA=$(curl -s --max-time 3 "https://openrouter.ai/api/v1/auth/key" \
        -H "Authorization: Bearer $KEY" 2>/dev/null)
      if [ -n "$DATA" ]; then
        USAGE=$(echo "$DATA" | jq -r '.data.usage // 0' 2>/dev/null)
        LIMIT=$(echo "$DATA" | jq -r '.data.limit // 0' 2>/dev/null)
        REMAIN=$(echo "$DATA" | jq -r '.data.limit_remaining // 0' 2>/dev/null)
        printf '{"ts":%s,"usage":%s,"limit":%s,"remaining":%s}\n' \
          "$NOW" "${USAGE:-0}" "${LIMIT:-0}" "${REMAIN:-0}" > "$CACHE" 2>/dev/null
      fi
    fi
  fi
  if [ -f "$CACHE" ]; then
    USAGE=$(jq -r '.usage // 0' "$CACHE" 2>/dev/null)
    LIMIT=$(jq -r '.limit // 0' "$CACHE" 2>/dev/null)
    REMAINING=$(jq -r '.remaining // 0' "$CACHE" 2>/dev/null)
    # Si pas de limite configurée côté OpenRouter, fallback sur fichier budget local
    if [ "$LIMIT" = "0" ] || [ "$LIMIT" = "null" ]; then
      FALLBACK=$(cat ~/.claude/openrouter-budget 2>/dev/null || echo 0)
      LIMIT=${OPENROUTER_BUDGET:-$FALLBACK}
      REMAINING=$(LC_NUMERIC=C awk "BEGIN {printf \"%.2f\", ${LIMIT} - ${USAGE}}" 2>/dev/null || echo "?")
    fi
    LIMIT=${LIMIT:-0}
    if [ "$LIMIT" != "0" ] && [ "$LIMIT" != "null" ]; then
      PCT=$(LC_NUMERIC=C awk "BEGIN {printf \"%.0f\", (${USAGE}/${LIMIT})*100}" 2>/dev/null || echo "?")
      if [ "$PCT" != "?" ] && [ "$PCT" -ge 80 ]; then
        or_c="\033[1;31m"
      elif [ "$PCT" != "?" ] && [ "$PCT" -ge 50 ]; then
        or_c="\033[1;33m"
      else
        or_c="\033[1;32m"
      fi
      printf "  |  OR: ${or_c}\$%s/%s\$ (%s%%)\033[0m" "$(LC_NUMERIC=C awk "BEGIN {printf \"%.2f\", ${USAGE}}" 2>/dev/null)" "$(LC_NUMERIC=C awk "BEGIN {printf \"%.0f\", ${LIMIT}}" 2>/dev/null)" "$PCT"
    fi
  fi
fi

# --- 5h rate limit + reset (Anthropic) ---
if [ -n "$five_hour" ]; then
  pct5=$(printf '%.0f' "$five_hour")
  if [ -n "$five_reset" ] && [ "$five_reset" != "null" ]; then
    reset5=$(date -d "@$five_reset" +"%Hh%M" 2>/dev/null || date -r "$five_reset" +"%Hh%M" 2>/dev/null || echo "?")
  else
    reset5="?"
  fi
  if [ "$pct5" -ge 80 ]; then
    c5="\033[1;31m"
  elif [ "$pct5" -ge 50 ]; then
    c5="\033[1;33m"
  else
    c5="\033[1;32m"
  fi
  printf "  |  5h: ${c5}%s%%\033[0m \033[0;90m->%s\033[0m" "$pct5" "$reset5"
fi

# --- 7d rate limit + reset (Anthropic) ---
if [ -n "$seven_day" ]; then
  pct7=$(printf '%.0f' "$seven_day")
  if [ -n "$seven_reset" ] && [ "$seven_reset" != "null" ]; then
    reset7=$(date -d "@$seven_reset" +"%a %Hh%M" 2>/dev/null || date -r "$seven_reset" +"%a %Hh%M" 2>/dev/null || echo "?")
  else
    reset7="?"
  fi
  if [ "$pct7" -ge 80 ]; then
    c7="\033[1;31m"
  elif [ "$pct7" -ge 50 ]; then
    c7="\033[1;33m"
  else
    c7="\033[1;32m"
  fi
  printf "  |  7d: ${c7}%s%%\033[0m \033[0;90m->%s\033[0m" "$pct7" "$reset7"
fi

printf "\n"