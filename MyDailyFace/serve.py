#!/usr/bin/env python3
import http.server
import socketserver
import os
import threading
import time

PORT = 8080
DIRECTORY = "dist/my-daily-face/browser"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

os.chdir('/Users/derek/workspace/MyDailyFace/MyDailyFace')

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Server running at http://localhost:{PORT}/")
    print(f"Serving files from: {os.path.abspath(DIRECTORY)}")
    print("Press Ctrl+C to stop")
    httpd.serve_forever()