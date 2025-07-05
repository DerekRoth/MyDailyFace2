#!/usr/bin/env python3
import http.server
import ssl
import os
import subprocess
import sys

# Change to the correct directory
os.chdir('/Users/derek/workspace/MyDailyFace/MyDailyFace/dist/my-daily-face/browser')

# Generate self-signed certificate if it doesn't exist
if not os.path.exists('cert.pem') or not os.path.exists('key.pem'):
    print("Generating self-signed certificate...")
    try:
        subprocess.run([
            'openssl', 'req', '-x509', '-newkey', 'rsa:4096', 
            '-keyout', 'key.pem', '-out', 'cert.pem', '-days', '365', 
            '-nodes', '-subj', '/C=US/ST=CA/L=SF/O=Test/CN=localhost'
        ], check=True)
    except subprocess.CalledProcessError:
        print("Failed to generate certificate. Make sure openssl is installed.")
        sys.exit(1)

# Create server
httpd = http.server.HTTPServer(('localhost', 8444), http.server.SimpleHTTPRequestHandler)

# Wrap with SSL
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain('cert.pem', 'key.pem')
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

print("HTTPS server running at https://localhost:8444/")
print("Files served from:", os.getcwd())
print("Press Ctrl+C to stop")

try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped.")