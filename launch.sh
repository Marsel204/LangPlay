#!/usr/bin/env bash

# Terminate existing instances so you don't get "port already in use" errors
pkill -f "python3 Server.py"

# Navigate exactly to your project folder
cd /home/marsel/Projects/LanguagePlayer || exit

# Start the python backend server in the background
python3 Server.py &

# Wait briefly for server initialization
sleep 0.5

# Launch the app in your default web browser
xdg-open "http://127.0.0.1:8000/App.html"
