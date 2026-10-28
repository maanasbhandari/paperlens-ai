"""
PaperLensAI - Local Development Server
Runs a lightweight HTTP server on port 3000 to preview the application locally.
"""

import http.server
import socketserver
import os
import sys

PORT = 3000

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS and caching headers for local testing
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

if __name__ == '__main__':
    # Ensure current directory is paperlens-ai
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"🚀 PaperLensAI server starting on http://localhost:{PORT}")
    print("Press Ctrl+C to stop.")
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
