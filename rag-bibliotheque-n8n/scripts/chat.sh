#!/bin/bash
# Ouvre le chat du RAG dans une fenêtre Chrome sur la moitié gauche de l'écran.
# Usage : scripts/chat.sh
osascript <<'OSA'
tell application "Finder" to set b to bounds of window of desktop
tell application "Google Chrome"
	activate
	set win to make new window
	set URL of active tab of win to "http://localhost:5678/webhook/6f9792c4-9e03-4f4a-bc44-8664b907b3c8/chat"
	set bounds of win to {0, 25, ((item 3 of b) div 2), (item 4 of b)}
end tell
OSA
