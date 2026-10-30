"""Local-only development server. Uses the Python standard library."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Timer
import sys
import webbrowser

HOST = "127.0.0.1"
PORT = 8001


class GameHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".woff2": "font/woff2",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    root = Path(__file__).resolve().parent
    handler = partial(GameHandler, directory=str(root))
    try:
        server = ThreadingHTTPServer((HOST, PORT), handler)
    except OSError as error:
        print(f"Cannot start Palm Stack on port {PORT}: {error}")
        print("Close the previous Palm Stack server window, then try again.")
        return 1
    url = f"http://{HOST}:{PORT}/index.html"
    print(f"Palm Stack is ready: {url}", flush=True)
    print("Keep this window open while playing. Press Ctrl+C to stop.", flush=True)
    opener = Timer(0.5, lambda: webbrowser.open(url))
    opener.daemon = True
    opener.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nPalm Stack stopped.")
    finally:
        opener.cancel()
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
