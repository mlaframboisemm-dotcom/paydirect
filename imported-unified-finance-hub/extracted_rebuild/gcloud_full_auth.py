#!/usr/bin/env python3
"""
Full gcloud auth flow:
1. Start gcloud --no-launch-browser, capture the auth URL
2. Open the URL in browser, sign in with Google credentials
3. Extract the verification code from the redirect
4. Send the code back to gcloud
"""
import pexpect
import re
import time
import subprocess
import sys

GCLOUD = '/home/ubuntu/google-cloud-sdk/google-cloud-sdk/bin/gcloud'

print("[1] Starting gcloud auth login...")
child = pexpect.spawn(f'{GCLOUD} auth login --no-launch-browser', timeout=120, encoding='utf-8')

# Wait for the URL
child.expect('Once finished, enter the verification code', timeout=20)
output = child.before

# Extract the URL
url_match = re.search(r'(https://accounts\.google\.com/o/oauth2/auth\?[^\s\r\n]+)', output.replace('\r\n', ' ').replace('\n', ' '))
if not url_match:
    print("ERROR: Could not find auth URL")
    print("Output:", output[:500])
    sys.exit(1)

auth_url = url_match.group(1)
print(f"[2] Got auth URL (length: {len(auth_url)})")

# Now use Python requests to complete the OAuth flow
import requests
from urllib.parse import urlparse, parse_qs, urlencode

session = requests.Session()
session.headers.update({'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'})

# Step 1: Follow the auth URL to get the Google sign-in page
print("[3] Opening auth URL...")
r = session.get(auth_url, allow_redirects=True)
print(f"    Status: {r.status_code}, URL: {r.url[:80]}")

# Step 2: Submit email
from bs4 import BeautifulSoup
soup = BeautifulSoup(r.text, 'html.parser')

# Find the form and hidden fields
form_data = {}
for inp in soup.find_all('input', type='hidden'):
    if inp.get('name') and inp.get('value'):
        form_data[inp['name']] = inp['value']

form_data['identifier'] = 'laframboisemwj@gmail.com'
form_data['continue'] = auth_url

# Find the form action
form = soup.find('form')
action = form.get('action', 'https://accounts.google.com/signin/v2/identifier') if form else 'https://accounts.google.com/signin/v2/identifier'

print(f"[4] Submitting email to: {action[:60]}")
r2 = session.post(action, data=form_data, allow_redirects=True)
print(f"    Status: {r2.status_code}, URL: {r2.url[:80]}")

# Step 3: Submit password
soup2 = BeautifulSoup(r2.text, 'html.parser')
form_data2 = {}
for inp in soup2.find_all('input', type='hidden'):
    if inp.get('name') and inp.get('value'):
        form_data2[inp['name']] = inp['value']

form_data2['Passwd'] = 'Rasberry1'
form_data2['continue'] = auth_url

form2 = soup2.find('form')
action2 = form2.get('action', '') if form2 else ''
if not action2.startswith('http'):
    action2 = 'https://accounts.google.com' + action2

print(f"[5] Submitting password to: {action2[:60]}")
r3 = session.post(action2, data=form_data2, allow_redirects=True)
print(f"    Status: {r3.status_code}, URL: {r3.url[:80]}")

# Check if we got the code page
if 'authcode' in r3.url or 'code=' in r3.url:
    # Extract code from URL
    parsed = urlparse(r3.url)
    params = parse_qs(parsed.query)
    code = params.get('code', [''])[0]
    print(f"[6] Got code from URL redirect: {code[:30]}...")
elif 'authcode.html' in r3.text or 'verification code' in r3.text.lower():
    # Extract from page content
    code_match = re.search(r'<[^>]*id="code"[^>]*>([^<]+)<', r3.text)
    if not code_match:
        code_match = re.search(r'"code"\s*:\s*"([^"]+)"', r3.text)
    if not code_match:
        # Try to find it in the page text
        code_match = re.search(r'4/0[A-Za-z0-9_\-]+', r3.text)
    code = code_match.group(1) if code_match else ''
    print(f"[6] Got code from page: {code[:30]}..." if code else "[6] Could not extract code from page")
else:
    print(f"[6] Unexpected response. Saving to /tmp/auth_response.html")
    with open('/tmp/auth_response.html', 'w') as f:
        f.write(r3.text)
    print(f"    URL: {r3.url}")
    print(f"    Content preview: {r3.text[:500]}")
    code = ''

if code:
    print(f"\n[7] Sending code to gcloud: {code[:30]}...")
    child.sendline(code)
    child.expect(pexpect.EOF, timeout=30)
    result = child.before
    print(f"[8] gcloud result: {result[-300:]}")
    child.close()
    print(f"Exit code: {child.exitstatus}")
else:
    print("\nERROR: Could not get verification code")
    child.close()
