# Cairn nightly agent sweep.
# Runs Claude Code headless against the standing prompt in this same folder, so dev-lead
# can find and fix real bugs, open PRs, and log an audit doc — unattended, every night,
# independent of any particular Claude Code / Cowork session being open.
#
# Registered once via Task Scheduler (see the schtasks command Claude gave you). To change
# what the sweep does, edit daily-agent-sweep-prompt.txt in this folder — this script itself
# shouldn't need touching.

$ErrorActionPreference = "Stop"
Set-Location "D:\Adam\Coding\Cairn"

git pull --quiet origin main

$promptPath = Join-Path $PSScriptRoot "daily-agent-sweep-prompt.txt"
$prompt = Get-Content -Raw $promptPath

$logDir = Join-Path $PSScriptRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$logFile = Join-Path $logDir "sweep-$stamp.log"

claude -p $prompt --output-format json *> $logFile
