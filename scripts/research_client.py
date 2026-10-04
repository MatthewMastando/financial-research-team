#!/usr/bin/env python3
"""Narrow Grok Bot transport. Python 3.10+, no third-party packages."""
import argparse
import datetime
import email.utils
import json
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

MAX_BODY = 256 * 1024
TRANSIENT = {408, 429, 500, 502, 503, 504}

def retry_delay(headers, attempt):
    value = headers.get('Retry-After', '') if headers else ''
    try:
        return max(0, min(3600, float(value)))
    except ValueError:
        try:
            when = email.utils.parsedate_to_datetime(value)
            return max(0, min(3600, (when - datetime.datetime.now(datetime.timezone.utc)).total_seconds()))
        except (ValueError, TypeError):
            return min(60, 2 ** attempt) + random.uniform(0, 1)

def request(base_url, token, path, body=None, attempts=6):
    """Preserves the identical serialized payload for every retry."""
    parsed = urllib.parse.urlparse(base_url)
    if parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in {'localhost', '127.0.0.1'}):
        raise ValueError('RESEARCH_API_URL must use HTTPS (HTTP only for local tests)')
    if len(token) < 43:
        raise ValueError('Missing or invalid bot credential')
    for attempt in range(attempts):
        req = urllib.request.Request(base_url.rstrip('/') + path, data=body, headers={
            'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/json'
        }, method='POST' if body is not None else 'GET')
        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code not in TRANSIENT or attempt == attempts - 1:
                # Never print request headers, credentials, or unsanitized network errors.
                raise RuntimeError('Submission failed with HTTP %d; check run history and server status' % exc.code) from None
            time.sleep(retry_delay(exc.headers, attempt))
        except (urllib.error.URLError, TimeoutError):
            if attempt == attempts - 1:
                raise RuntimeError('Network unavailable after retries') from None
            time.sleep(retry_delay(None, attempt))
    raise RuntimeError('Retry limit reached')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest='operation', required=True)
    for operation in ('submit', 'run'):
        subs.add_parser(operation).add_argument('file', help='Saved JSON payload; keep unchanged on retry')
    context = subs.add_parser('context')
    for field in ('since', 'asset', 'desk', 'type', 'cursor'):
        context.add_argument('--' + field)
    context.add_argument('--limit', type=int, default=50)
    args = parser.parse_args()
    base_url = os.environ.get('RESEARCH_API_URL', '')
    token = os.environ.get('RESEARCH_BOT_TOKEN', '')
    if args.operation == 'context':
        if not 1 <= args.limit <= 100:
            raise ValueError('Limit must be between 1 and 100')
        fields = {key: value for key, value in vars(args).items() if key != 'operation' and value is not None}
        result = request(base_url, token, '/v1/research-context?' + urllib.parse.urlencode(fields))
    else:
        with open(args.file, 'rb') as f:
            body = f.read(MAX_BODY + 1)
        if len(body) > MAX_BODY:
            raise ValueError('Payload exceeds 256 KiB')
        payload = json.loads(body)
        if args.operation == 'submit' and (payload.get('schema_version') != 1 or not payload.get('submission_id')):
            raise ValueError('A version 1 report and stable submission_id are required')
        result = request(base_url, token, '/v1/reports' if args.operation == 'submit' else '/v1/desk-runs', body)
    print(json.dumps(result, indent=2))

if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, OSError, json.JSONDecodeError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
