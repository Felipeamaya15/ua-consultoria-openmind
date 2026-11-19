"""Loopback-only HTTPS for local Instagram review; never exposes a tunnel or installs a CA."""
import argparse
import http.client
import ipaddress
import ssl
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True, help='Frontend build outside the checkout')
    parser.add_argument('--cert', required=True)
    parser.add_argument('--key', required=True)
    parser.add_argument('--api-port', type=int, default=8000)
    parser.add_argument('--port', type=int, default=8444)
    parser.add_argument('--generate-cert', action='store_true')
    args = parser.parse_args()
    backend = Path(__file__).resolve().parent.parent
    checkout = backend.parent if (backend.parent / 'frontend').is_dir() else backend
    root, cert, key = (Path(value).resolve() for value in (args.root, args.cert, args.key))
    if any(value.is_relative_to(checkout) for value in (root, cert, key)):
        parser.error('Build, certificado y clave deben quedar fuera del repositorio.')
    if args.generate_cert:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
        if cert.exists() or key.exists():
            parser.error('El certificado existente se conserva; usa otra ruta para generar uno nuevo.')
        private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'localhost')])
        certificate = (x509.CertificateBuilder().subject_name(subject).issuer_name(subject).public_key(private.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(datetime.now(timezone.utc)-timedelta(minutes=1))
            .not_valid_after(datetime.now(timezone.utc)+timedelta(days=14))
            .add_extension(x509.SubjectAlternativeName([x509.DNSName('localhost'), x509.IPAddress(ipaddress.ip_address('127.0.0.1'))]), critical=False)
            .sign(private, hashes.SHA256()))
        cert.parent.mkdir(parents=True, exist_ok=True); key.parent.mkdir(parents=True, exist_ok=True)
        key.write_bytes(private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        cert.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
        print('Certificado autofirmado local generado fuera del repositorio. No se instaló confianza en el sistema.')
        return
    if not (root / 'index.html').is_file():
        parser.error('Falta el build del frontend en --root.')
    class Handler(SimpleHTTPRequestHandler):
        extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml'}
        def __init__(self, *values, **kwargs): super().__init__(*values, directory=str(root), **kwargs)
        def log_message(self, fmt, *values):
            print(self.command, urlsplit(self.path).path, flush=True)
        def proxy(self):
            size = int(self.headers.get('Content-Length', '0'))
            if size < 0 or size > 10 * 1024 * 1024:
                self.send_error(413); return
            connection = http.client.HTTPConnection('127.0.0.1', args.api_port, timeout=65)
            try:
                headers = {k: v for k, v in self.headers.items() if k.lower() not in ('host', 'connection', 'transfer-encoding', 'x-forwarded-proto')}
                headers.update({'Host': f'localhost:{args.port}', 'X-Forwarded-Proto': 'https'})
                connection.request(self.command, self.path, self.rfile.read(size) if size else None, headers)
                response = connection.getresponse(); self.send_response(response.status)
                for name, value in response.getheaders():
                    if name.lower() not in ('connection', 'transfer-encoding'):
                        self.send_header(name, value)
                self.end_headers()
                if self.command != 'HEAD':
                    while chunk := response.read(65536): self.wfile.write(chunk)
            except (OSError, http.client.HTTPException):
                self.send_error(502, 'Backend local no disponible')
            finally:
                connection.close()
        def do_GET(self):
            if self.path.startswith(('/api/', '/media/', '/landing/')): return self.proxy()
            if not Path(urlsplit(self.path).path).suffix: self.path = '/index.html'
            return super().do_GET()
        def do_HEAD(self):
            if self.path.startswith(('/api/', '/media/', '/landing/')): return self.proxy()
            return super().do_HEAD()
        def do_POST(self):
            if not self.path.startswith('/api/'): self.send_error(405); return
            self.proxy()
        do_PUT = do_PATCH = do_DELETE = do_POST
    class LocalServer(ThreadingHTTPServer):
        request_queue_size = 128
    server = LocalServer(('127.0.0.1', args.port), Handler)
    tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); tls.load_cert_chain(str(cert), str(key))
    server.socket = tls.wrap_socket(server.socket, server_side=True)
    print(f'HTTPS local: https://localhost:{args.port}; callback /api/instagram/oauth/callback/', flush=True)
    server.serve_forever()


if __name__ == '__main__': main()
