"""Public tunnel entry: OAuth callback and signed temporary JPEGs only. No generic proxy."""
import argparse
import http.client
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

CALLBACK = '/api/instagram/oauth/callback/'
IMAGE = re.compile(r'/api/instagram/imagenes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/')


def permitted(target):
    if len(target) > 6500:
        return False
    url = urlsplit(target)
    if url.scheme or url.netloc or url.fragment or '%' in url.path:
        return False
    try:
        query = parse_qs(url.query, keep_blank_values=True, max_num_fields=8, strict_parsing=True)
    except ValueError:
        return False
    if any(len(values) != 1 for values in query.values()):
        return False
    if url.path == CALLBACK:
        # The optional one-use inicio ticket sets the public-domain OAuth cookie before Meta.
        if 'inicio' in query:
            return set(query) == {'inicio'} and bool(re.fullmatch(r'[A-Za-z0-9_-]{64}', query['inicio'][0]))
        return (set(query) <= {'state', 'code', 'error', 'error_reason', 'error_description'}
            and all(len(value[0]) <= (200 if name == 'state' else 2048) for name, value in query.items()))
    return bool(IMAGE.fullmatch(url.path) and set(query) == {'firma'} and 0 < len(query['firma'][0]) <= 1000)


def make_handler(api_port):
    class Handler(BaseHTTPRequestHandler):
        server_version = 'OpenMind'
        sys_version = ''
        def setup(self):
            super().setup(); self.connection.settimeout(15)
        def log_message(self, *_):
            # Never log callback codes, state, inicio tickets, cookies or signed image URLs.
            pass
        def reject(self, status=404):
            self.send_response(status); self.send_header('Content-Length', '0')
            self.send_header('Cache-Control', 'no-store'); self.send_header('Referrer-Policy', 'no-referrer'); self.end_headers()
        def do_GET(self):
            if not permitted(self.path) or self.headers.get('Transfer-Encoding') or self.headers.get('Content-Length', '0') != '0':
                self.reject(); return
            connection = http.client.HTTPConnection('127.0.0.1', api_port, timeout=35)
            try:
                headers = {'Host': 'localhost', 'X-Forwarded-Proto': 'https'}
                cookie = self.headers.get('Cookie', '')
                if len(cookie) > 4096:
                    self.reject(); return
                if urlsplit(self.path).path == CALLBACK and cookie:
                    headers['Cookie'] = cookie
                connection.request('GET', self.path, headers=headers)
                response = connection.getresponse()
                if response.status >= 400:
                    self.reject(response.status); return
                is_image = IMAGE.fullmatch(urlsplit(self.path).path)
                if is_image and (response.status != 200 or response.getheader('Content-Type') != 'image/jpeg'):
                    self.reject(502); return
                payload = response.read(8*1024*1024+1)
                if len(payload) > 8*1024*1024:
                    self.reject(502); return
                self.send_response(response.status)
                for name, value in response.getheaders():
                    if name.lower() in ('content-type', 'content-disposition', 'location', 'set-cookie', 'content-security-policy'):
                        self.send_header(name, value)
                self.send_header('Cache-Control', 'no-store, private, max-age=0')
                self.send_header('Referrer-Policy', 'no-referrer'); self.send_header('X-Content-Type-Options', 'nosniff')
                self.send_header('Content-Length', str(len(payload))); self.end_headers(); self.wfile.write(payload)
            except (OSError, http.client.HTTPException):
                self.reject(502)
            finally:
                connection.close()
        def do_POST(self): self.reject(405)
        do_PUT = do_PATCH = do_DELETE = do_OPTIONS = do_HEAD = do_POST
    return Handler


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api-port', type=int, required=True)
    parser.add_argument('--port', type=int, default=8445)
    args = parser.parse_args()
    print(f'Gateway restringido en 127.0.0.1:{args.port}; backend loopback:{args.api_port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(args.api_port)).serve_forever()
