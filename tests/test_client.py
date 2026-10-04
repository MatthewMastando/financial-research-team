import importlib.util
import io
import json
import unittest
import urllib.error
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('research_client', 'scripts/research_client.py')
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)

class ClientTransportTests(unittest.TestCase):
    def test_transient_retry_preserves_payload_and_honors_retry_after(self):
        body = b'{"submission_id":"stable-fixture"}'
        requests = []
        def send(request, timeout):
            requests.append(request)
            if len(requests) == 1:
                raise urllib.error.HTTPError(request.full_url, 429, 'rate limited', {'Retry-After': '2'}, None)
            return io.BytesIO(json.dumps({'report_id': 'fixture'}).encode())
        with patch.object(client.urllib.request, 'urlopen', send), patch.object(client.time, 'sleep') as wait:
            receipt = client.request('https://example.test/api', 'fixture-token-' + 'x'*43, '/v1/reports', body)
        self.assertEqual(receipt['report_id'], 'fixture')
        self.assertEqual([r.data for r in requests], [body, body])
        wait.assert_called_once_with(2)

    def test_validation_is_not_retried_and_error_does_not_expose_token(self):
        token = 'secret-fixture-' + 'x'*43
        failure = urllib.error.HTTPError('https://example.test', 422, 'invalid', {}, None)
        with patch.object(client.urllib.request, 'urlopen', side_effect=failure) as send:
            with self.assertRaises(RuntimeError) as error:
                client.request('https://example.test/api', token, '/v1/reports', b'{}')
        self.assertEqual(send.call_count, 1)
        self.assertNotIn(token, str(error.exception))

    def test_refuses_insecure_remote_transport(self):
        with self.assertRaises(ValueError):
            client.request('http://example.test', 'x'*43, '/v1/reports', b'{}')

if __name__ == '__main__':
    unittest.main()
