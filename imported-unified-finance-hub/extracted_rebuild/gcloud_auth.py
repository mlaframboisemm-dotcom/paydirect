#!/usr/bin/env python3
"""
Interactive gcloud auth using pexpect.
Starts gcloud, captures the auth URL, opens it in browser,
waits for user to paste the code, then completes auth.
"""
import pexpect
import sys
import re

GCLOUD = '/home/ubuntu/google-cloud-sdk/google-cloud-sdk/bin/gcloud'

print("Starting gcloud auth login...")
child = pexpect.spawn(f'{GCLOUD} auth login --no-launch-browser', timeout=120, encoding='utf-8')
child.logfile = sys.stdout

# Wait for the URL to appear
child.expect('Once finished, enter the verification code provided in your browser:', timeout=30)

# Get the output so far to extract the URL
output = child.before
url_match = re.search(r'https://accounts\.google\.com/o/oauth2/auth\?[^\s]+', output.replace('\r\n', '').replace('\n', ''))
if url_match:
    url = url_match.group(0)
    print(f"\n\n{'='*60}")
    print("OPEN THIS URL IN YOUR BROWSER:")
    print(url)
    print(f"{'='*60}\n")

# Now wait for the user to paste the code
print("Waiting for verification code... (paste it below)")
code = input("Enter verification code: ").strip()

# Send the code to gcloud
child.sendline(code)

# Wait for completion
try:
    child.expect(['You are now logged in', 'Saved Application Default Credentials', 'ERROR'], timeout=30)
    result = child.after
    print(f"\nResult: {result}")
except pexpect.TIMEOUT:
    print("Timeout waiting for auth completion")
except pexpect.EOF:
    print("Process ended")

child.close()
print(f"\nReturn code: {child.exitstatus}")
