from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from django.test import SimpleTestCase
from scripts.instagram_public_gateway import make_handler, permitted


class GatewayTests(SimpleTestCase):
    def setUp(self):
        self.calls=[]
        outer=self
        class Origin(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_GET(self):
                outer.calls.append(self.path)
                self.send_response(302); self.send_header('Location', 'https://www.facebook.com/dialog/oauth?state=synthetic')
                self.send_header('Set-Cookie', 'openmind_instagram_oauth=synthetic; Secure; HttpOnly; SameSite=Lax; Path=/api/instagram/oauth/callback/')
                self.end_headers()
        self.origin=ThreadingHTTPServer(('127.0.0.1',0), Origin)
        self.gateway=ThreadingHTTPServer(('127.0.0.1',0), make_handler(self.origin.server_port))
        for server in (self.origin,self.gateway):
            thread=Thread(target=server.serve_forever,daemon=True); thread.start()
            self.addCleanup(lambda s=server,t=thread: (s.shutdown(),s.server_close(),t.join()))

    def fetch(self, path, method='GET'):
        connection=HTTPConnection('127.0.0.1',self.gateway.server_port)
        connection.request(method,path); response=connection.getresponse(); response.read(); connection.close(); return response

    def test_denied_paths_methods_and_encoded_bypasses_never_reach_backend(self):
        for path in ('/', '/admin/', '/api/auth/', '/api/instagram/estado/', '/api/instagram/oauth/iniciar/',
                '/media/instagram/publicaciones/x.jpg', '/api/instagram/oauth/callback/../estado/',
                '/api/instagram/oauth/%63allback/', '//localhost/admin/', '/api/instagram/oauth/callback/?unknown=1',
                '/api/instagram/oauth/callback/?state=a&state=b', '/api/instagram/imagenes/not-uuid/?firma=x'):
            self.assertEqual(self.fetch(path).status,404,path)
        for method in ('POST','PUT','PATCH','DELETE','HEAD','OPTIONS'):
            self.assertEqual(self.fetch('/api/instagram/oauth/callback/', method).status,405)
        self.assertEqual(self.calls,[])

    def test_callback_forwards_secure_cookie_and_keeps_queries_out_of_logs(self):
        path='/api/instagram/oauth/callback/?inicio='+'A'*64
        response=self.fetch(path)
        self.assertEqual(response.status,302); self.assertIn('Secure',response.getheader('Set-Cookie'))
        self.assertEqual(response.getheader('Referrer-Policy'),'no-referrer')
        self.assertEqual(self.calls,[path])

    def test_signed_image_route_accepts_only_uuid_and_one_bounded_signature(self):
        path='/api/instagram/imagenes/12345678-1234-1234-1234-123456789abc/'
        self.assertTrue(permitted(path+'?firma=synthetic-signature'))
        for query in ('', '?firma=', '?firma=x&firma=y', '?firma=x&path=/admin', '?firma='+'x'*1001):
            self.assertFalse(permitted(path+query))
